'use server';

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { SaveLayoutInput } from '@/types/venue';
import { generateSeatGrid } from '@/lib/seatGenerator';

export async function saveLayoutAction(input: SaveLayoutInput): Promise<{ success: boolean; layoutId?: string; error?: string }> {
  try {
    // Pre-process sections so CPU calculations happen before opening DB transaction
    const processedSections = input.sections.map((sec) => {
      const geomObj = typeof sec.geometry === 'string' ? (() => { try { return JSON.parse(sec.geometry); } catch { return {}; } })() : (sec.geometry || {});
      const isStage = sec.shapeType === 'STAGE' || geomObj?.shapeType === 'STAGE';
      let seatsToCreate = sec.seats;
      if (isStage) {
        seatsToCreate = [];
      } else if (!seatsToCreate || seatsToCreate.length === 0) {
        if (sec.rowCount > 0 && sec.seatsPerRow > 0) {
          seatsToCreate = generateSeatGrid({
            geometry: geomObj,
            rowCount: sec.rowCount,
            seatsPerRow: sec.seatsPerRow,
          }) as any;
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
        const validTierIds = new Set<string>();

        if (input.pricingTiers !== undefined) {
          const incomingTierIds: string[] = [];

          // Query existing tiers for this layout if updating
          const existingTiers = input.layoutId
            ? await tx.pricingTier.findMany({ where: { layoutId: layout.id } })
            : [];
          const existingTierMap = new Map(existingTiers.map((t) => [t.id, t]));

          for (const t of input.pricingTiers) {
            // Sanitize user inputs
            const cleanName = (t.name || 'Untitled Tier').trim().slice(0, 100);
            const cleanColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(t.color) ? t.color : '#6366f1';
            const cleanBasePrice = Math.max(0, Math.floor(Number(t.basePrice) || 0));
            const cleanDescription = t.description ? t.description.trim().slice(0, 500) : null;
            const cleanSalesEndDate = t.salesEndDate ? new Date(t.salesEndDate) : null;

            let targetId: string;
            if (t.id && existingTierMap.has(t.id)) {
              // Existing tier for this layout
              targetId = t.id;
            } else if (t.id && t.id.length >= 20 && !t.id.startsWith('tier-')) {
              // Valid UUID or unique ID from caller
              targetId = t.id;
            } else if (t.id && (t.id.startsWith('tier-vip-') || t.id.startsWith('tier-std-') || t.id.startsWith('tier-eco-') || t.id.startsWith('tier-prem-'))) {
              // Known seed/fixture tier ID format
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
                layoutId: layout.id,
                name: cleanName,
                color: cleanColor,
                basePrice: cleanBasePrice,
                description: cleanDescription,
                salesEndDate: cleanSalesEndDate,
              },
              update: {
                layoutId: layout.id,
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
        } else if (input.layoutId) {
          // If pricingTiers was omitted in update payload, fetch existing layout tiers to preserve mappings
          const existingTiers = await tx.pricingTier.findMany({ where: { layoutId: layout.id } });
          for (const et of existingTiers) {
            tierIdMap[et.id] = et.id;
            validTierIds.add(et.id);
          }
        }

        // Re-create sections and their seats
        for (const sec of processedSections) {
          const isStage = sec.shapeType === 'STAGE';
          const dbShapeType = sec.shapeType;
          const geomObj = typeof sec.geometry === 'string' ? JSON.parse(sec.geometry) : sec.geometry;
          const geomToSave = JSON.stringify({ ...geomObj, shapeType: dbShapeType, clipToBoundary: false });

          // Determine pricingTierId strictly
          let resolvedPricingTierId: string | null = null;
          const incomingTierId = typeof sec.tierId === 'string'
            ? sec.tierId.trim()
            : (typeof (sec as any).pricingTierId === 'string' ? (sec as any).pricingTierId.trim() : null);

          if (!isStage && incomingTierId && incomingTierId !== 'null' && incomingTierId !== 'undefined' && incomingTierId !== 'none') {
            const mappedId = tierIdMap[incomingTierId] || incomingTierId;
            if (validTierIds.has(mappedId)) {
              resolvedPricingTierId = mappedId;
            } else {
              // Check if mappedId exists in database PricingTier table for this layout or global
              const dbTier = await tx.pricingTier.findFirst({
                where: {
                  id: mappedId,
                  OR: [{ layoutId: layout.id }, { layoutId: null }],
                },
              });
              if (dbTier) {
                resolvedPricingTierId = dbTier.id;
                validTierIds.add(dbTier.id);
              }
            }
          }

          const sectionDataToCreate = {
            layoutId: layout.id,
            name: sec.name,
            code: sec.code,
            shapeType: dbShapeType as any,
            geometry: geomToSave,
            pricingTierId: resolvedPricingTierId,
            price: isStage ? 0 : (sec.price ?? 0),
            color: sec.color,
            rowCount: isStage ? 0 : (sec.rowCount ?? 0),
            seatsPerRow: isStage ? 0 : (sec.seatsPerRow ?? 0),
          };

          const section = await tx.section.create({
            data: sectionDataToCreate,
          });

          if (!isStage && sec.seatsToCreate && sec.seatsToCreate.length > 0) {
            await tx.seat.createMany({
              data: sec.seatsToCreate.map((s) => ({
                sectionId: section.id,
                row: s.row,
                number: s.number,
                x: s.x,
                y: s.y,
                status: 'AVAILABLE',
                pricingTierId: resolvedPricingTierId,
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
