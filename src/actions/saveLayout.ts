'use server';

import crypto from 'crypto';
import { prisma, TransactionClient } from '@/lib/prisma';
import { SaveLayoutInput, SectionGeometry } from '@/types/venue';
import { generateSeatGrid, GeneratedSeat } from '@/lib/seatGenerator';
import { parseGeometry } from '@/lib/parseGeometry';
import { SaveLayoutSchema } from '@/lib/schemas';

interface ProcessedSection {
  name: string;
  code: string;
  shapeType: string;
  geometry: SectionGeometry;
  tierId?: string;
  price?: number;
  color: string;
  rowCount?: number;
  seatsPerRow?: number;
  seatsToCreate: GeneratedSeat[];
}

interface TierSyncResult {
  tierIdMap: Record<string, string>;
  validTierIds: Set<string>;
}

/**
 * Pre-processes sections so CPU-bound seat grid generation happens before opening a database transaction.
 */
function preprocessSections(sections: SaveLayoutInput['sections']): ProcessedSection[] {
  return sections.map((sec) => {
    const geomObj: SectionGeometry = (parseGeometry(sec.geometry) as SectionGeometry) || {
      shapeType: 'RECTANGLE' as const,
      points: [],
    };

    const isStage = sec.shapeType === 'STAGE' || geomObj?.shapeType === 'STAGE';
    let seatsToCreate = sec.seats as GeneratedSeat[] | undefined;

    if (isStage) {
      seatsToCreate = [];
    } else if (!seatsToCreate || seatsToCreate.length === 0) {
      if (sec.rowCount > 0 && sec.seatsPerRow > 0) {
        seatsToCreate = generateSeatGrid({
          geometry: geomObj,
          rowCount: sec.rowCount,
          seatsPerRow: sec.seatsPerRow,
        });
      } else {
        seatsToCreate = [];
      }
    }

    return {
      ...sec,
      shapeType: isStage ? 'STAGE' : sec.shapeType,
      geometry: geomObj,
      seatsToCreate: isStage ? [] : seatsToCreate,
    };
  });
}

/**
 * Creates or updates the VenueLayout record.
 */
async function upsertVenueLayout(
  tx: TransactionClient,
  input: { layoutId?: string; name: string; canvasWidth: number; canvasHeight: number }
) {
  if (input.layoutId) {
    await tx.section.deleteMany({ where: { layoutId: input.layoutId } });
    return tx.venueLayout.update({
      where: { id: input.layoutId },
      data: {
        name: input.name,
        canvasWidth: input.canvasWidth,
        canvasHeight: input.canvasHeight,
        updatedAt: new Date(),
      },
    });
  }

  return tx.venueLayout.create({
    data: {
      name: input.name,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
    },
  });
}

/**
 * Synchronizes layout pricing tiers with the database.
 */
async function syncPricingTiers(
  tx: TransactionClient,
  layoutId: string,
  pricingTiers?: SaveLayoutInput['pricingTiers'],
  isUpdate?: boolean
): Promise<TierSyncResult> {
  const tierIdMap: Record<string, string> = {};
  const validTierIds = new Set<string>();

  if (pricingTiers !== undefined) {
    const incomingTierIds: string[] = [];

    const existingTiers = isUpdate
      ? await tx.pricingTier.findMany({ where: { layoutId } })
      : [];
    const existingTierMap = new Map(existingTiers.map((t) => [t.id, t]));

    for (const t of pricingTiers) {
      const cleanName = (t.name || 'Untitled Tier').trim().slice(0, 100);
      const cleanColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(t.color) ? t.color : '#6366f1';
      const cleanBasePrice = Math.max(0, Math.floor(Number(t.basePrice) || 0));
      const cleanDescription = t.description ? t.description.trim().slice(0, 500) : null;
      const cleanSalesEndDate = t.salesEndDate ? new Date(t.salesEndDate) : null;

      let targetId: string;
      if (t.id && existingTierMap.has(t.id)) {
        targetId = t.id;
      } else if (t.id && t.id.length >= 20 && !t.id.startsWith('tier-')) {
        targetId = t.id;
      } else if (
        t.id &&
        (t.id.startsWith('tier-vip-') ||
          t.id.startsWith('tier-std-') ||
          t.id.startsWith('tier-eco-') ||
          t.id.startsWith('tier-prem-'))
      ) {
        targetId = t.id;
      } else {
        targetId = t.id && !t.id.startsWith('tier-') ? t.id : crypto.randomUUID();
      }

      if (t.id) {
        tierIdMap[t.id] = targetId;
      }
      tierIdMap[targetId] = targetId;
      validTierIds.add(targetId);
      incomingTierIds.push(targetId);

      await tx.pricingTier.upsert({
        where: { id: targetId },
        create: {
          id: targetId,
          layoutId,
          name: cleanName,
          color: cleanColor,
          basePrice: cleanBasePrice,
          description: cleanDescription,
          salesEndDate: cleanSalesEndDate,
        },
        update: {
          layoutId,
          name: cleanName,
          color: cleanColor,
          basePrice: cleanBasePrice,
          description: cleanDescription,
          salesEndDate: cleanSalesEndDate,
        },
      });
    }

    if (isUpdate) {
      await tx.pricingTier.deleteMany({
        where: incomingTierIds.length > 0
          ? { layoutId, id: { notIn: incomingTierIds } }
          : { layoutId },
      });
    }
  } else if (isUpdate) {
    const existingTiers = await tx.pricingTier.findMany({ where: { layoutId } });
    for (const et of existingTiers) {
      tierIdMap[et.id] = et.id;
      validTierIds.add(et.id);
    }
  }

  return { tierIdMap, validTierIds };
}

/**
 * Re-creates sections and their associated seats for the layout.
 */
async function createSectionsAndSeats(
  tx: TransactionClient,
  layoutId: string,
  sections: ProcessedSection[],
  tierContext: TierSyncResult
) {
  const { tierIdMap, validTierIds } = tierContext;

  for (const sec of sections) {
    const isStage = sec.shapeType === 'STAGE';
    const dbShapeType = sec.shapeType;
    const geomToSave = JSON.stringify({
      ...sec.geometry,
      shapeType: dbShapeType,
      clipToBoundary: false,
    });

    let resolvedPricingTierId: string | null = null;
    const incomingTierId =
      typeof sec.tierId === 'string'
        ? sec.tierId.trim()
        : typeof (sec as unknown as { pricingTierId?: string }).pricingTierId === 'string'
        ? (sec as unknown as { pricingTierId?: string }).pricingTierId!.trim()
        : null;

    if (
      !isStage &&
      incomingTierId &&
      incomingTierId !== 'null' &&
      incomingTierId !== 'undefined' &&
      incomingTierId !== 'none'
    ) {
      const mappedId = tierIdMap[incomingTierId] || incomingTierId;
      if (validTierIds.has(mappedId)) {
        resolvedPricingTierId = mappedId;
      } else {
        const dbTier = await tx.pricingTier.findFirst({
          where: {
            id: mappedId,
            layoutId: layoutId,
          },
        });
        if (dbTier) {
          resolvedPricingTierId = dbTier.id;
          validTierIds.add(dbTier.id);
        }
      }
    }

    const section = await tx.section.create({
      data: {
        layoutId,
        name: sec.name,
        code: sec.code,
        shapeType: dbShapeType as 'RECTANGLE' | 'SQUARE' | 'TRIANGLE' | 'POLYGON' | 'CIRCLE' | 'STAGE',
        geometry: geomToSave,
        pricingTierId: resolvedPricingTierId,
        price: isStage ? 0 : sec.price ?? 0,
        color: sec.color,
        rowCount: isStage ? 0 : sec.rowCount ?? 0,
        seatsPerRow: isStage ? 0 : sec.seatsPerRow ?? 0,
      },
    });

    if (!isStage && sec.seatsToCreate && sec.seatsToCreate.length > 0) {
      await tx.seat.createMany({
        data: sec.seatsToCreate.map((s) => ({
          sectionId: section.id,
          row: s.row,
          number: s.number,
          x: s.x,
          y: s.y,
          status: 'AVAILABLE' as const,
          pricingTierId: resolvedPricingTierId,
        })),
      });
    }
  }
}

export async function saveLayoutAction(
  input: SaveLayoutInput
): Promise<{ success: boolean; layoutId?: string; error?: string }> {
  try {
    const parsed = SaveLayoutSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid layout input' };
    }

    const processedSections = preprocessSections(input.sections);

    const layoutId = await prisma.$transaction(
      async (tx) => {
        const layout = await upsertVenueLayout(tx, {
          layoutId: input.layoutId,
          name: input.name,
          canvasWidth: input.canvasWidth,
          canvasHeight: input.canvasHeight,
        });

        const tierContext = await syncPricingTiers(
          tx,
          layout.id,
          input.pricingTiers,
          Boolean(input.layoutId)
        );

        await createSectionsAndSeats(tx, layout.id, processedSections, tierContext);

        return layout.id;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    return { success: true, layoutId };
  } catch (err: unknown) {
    console.error('[saveLayoutAction] Failed to save layout:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save layout.' };
  }
}

export async function getLayouts() {
  const layouts = await prisma.venueLayout.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      pricingTiers: true,
      sections: {
        include: { _count: { select: { seats: true } } },
      },
    },
  });
  return layouts.map((l) => ({
    id: l.id,
    name: l.name,
    canvasWidth: l.canvasWidth,
    canvasHeight: l.canvasHeight,
    updatedAt: l.updatedAt.toISOString(),
    sectionCount: l.sections.length,
    totalSeats: l.sections.reduce((sum, s) => sum + s._count.seats, 0),
  }));
}

export async function getLayoutById(layoutId: string) {
  const layout = await prisma.venueLayout.findUnique({
    where: { id: layoutId },
    include: {
      pricingTiers: true,
      sections: {
        include: { seats: true, pricingTier: true },
      },
    },
  });
  if (!layout) return null;
  return layout;
}
