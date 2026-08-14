'use server';

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { SaveLayoutInput } from '@/types/venue';
import { generateSeatGrid } from '@/lib/seatGenerator';

export async function saveLayoutAction(input: SaveLayoutInput): Promise<{ success: boolean; layoutId?: string; error?: string }> {
  try {
    // Pre-process sections so CPU calculations happen before opening DB transaction
    const processedSections = input.sections.map((sec) => {
      let seatsToCreate = sec.seats;
      if (sec.shapeType === 'STAGE' || !seatsToCreate || seatsToCreate.length === 0) {
        if (sec.shapeType !== 'STAGE' && sec.rowCount > 0 && sec.seatsPerRow > 0) {
          seatsToCreate = generateSeatGrid({
            geometry: sec.geometry,
            rowCount: sec.rowCount,
            seatsPerRow: sec.seatsPerRow,
          }) as any;
        } else {
          seatsToCreate = [];
        }
      }
      return {
        ...sec,
        seatsToCreate,
      };
    });

    const layoutId = await prisma.$transaction(
      async (tx) => {
        let layout;

        if (input.layoutId) {
          // Update existing layout — delete old sections (cascade deletes seats)
          await tx.section.deleteMany({ where: { layoutId: input.layoutId } });
          layout = await tx.venueLayout.update({
            where: { id: input.layoutId },
            data: {
              name: input.name,
              canvasWidth: input.canvasWidth,
              canvasHeight: input.canvasHeight,
              updatedAt: new Date(),
            },
          });
        } else {
          layout = await tx.venueLayout.create({
            data: {
              name: input.name,
              canvasWidth: input.canvasWidth,
              canvasHeight: input.canvasHeight,
            },
          });
        }

        // Upsert / sync pricing tiers (preserves existing DB tiers, syncs new/updated ones)
        const tierIdMap: Record<string, string> = {};
        if (input.pricingTiers && input.pricingTiers.length > 0) {
          const incomingTierIds: string[] = [];

          for (const t of input.pricingTiers) {
            // Sanitize user inputs
            const cleanName = (t.name || 'Untitled Tier').trim().slice(0, 100);
            const cleanColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(t.color) ? t.color : '#6366f1';
            const cleanBasePrice = Math.max(0, Math.floor(Number(t.basePrice) || 0));
            const cleanDescription = t.description ? t.description.trim().slice(0, 500) : null;
            const cleanSalesEndDate = t.salesEndDate ? new Date(t.salesEndDate) : null;

            const targetId = (t.id && t.id.length >= 20 && !t.id.startsWith('tier-')) ? t.id : crypto.randomUUID();
            if (t.id) {
              tierIdMap[t.id] = targetId;
            }
            incomingTierIds.push(targetId);

            await tx.pricingTier.upsert({
              where: { id: targetId },
              create: {
                id: targetId,
                layoutId: layout.id,
                name: cleanName,
                color: cleanColor,
                basePrice: cleanBasePrice,
                description: cleanDescription,
                salesEndDate: cleanSalesEndDate,
              },
              update: {
                name: cleanName,
                color: cleanColor,
                basePrice: cleanBasePrice,
                description: cleanDescription,
                salesEndDate: cleanSalesEndDate,
              },
            });
          }

          // Delete only tiers that were explicitly removed in the editor
          if (input.layoutId) {
            await tx.pricingTier.deleteMany({
              where: {
                layoutId: layout.id,
                id: { notIn: incomingTierIds },
              },
            });
          }
        }

        // Re-create sections and their seats
        for (const sec of processedSections) {
          const isStage = sec.shapeType === 'STAGE';
          const dbShapeType = sec.shapeType;
          const geomObj = typeof sec.geometry === 'string' ? JSON.parse(sec.geometry) : sec.geometry;
          const geomToSave = JSON.stringify({ ...geomObj, shapeType: sec.shapeType, clipToBoundary: false });

          const section = await tx.section.create({
            data: {
              layoutId: layout.id,
              name: sec.name,
              code: sec.code,
              shapeType: dbShapeType as any,
              geometry: geomToSave,
              pricingTierId: isStage ? null : (sec.tierId ? (tierIdMap[sec.tierId] || sec.tierId) : null),
              price: isStage ? 0 : sec.price,
              color: sec.color,
              rowCount: isStage ? 0 : sec.rowCount,
              seatsPerRow: isStage ? 0 : sec.seatsPerRow,
            },
          });

          if (sec.seatsToCreate && sec.seatsToCreate.length > 0) {
            await tx.seat.createMany({
              data: sec.seatsToCreate.map((s) => ({
                sectionId: section.id,
                row: s.row,
                number: s.number,
                x: s.x,
                y: s.y,
                status: 'AVAILABLE',
              })),
            });
          }
        }

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
      sections: {
        include: { seats: true },
      },
    },
  });
  if (!layout) return null;
  return layout;
}
