'use server';

import { prisma } from '@/lib/prisma';
import { SaveLayoutInput } from '@/types/venue';
import { generateSeatGrid } from '@/lib/seatGenerator';

export async function saveLayoutAction(input: SaveLayoutInput): Promise<{ success: boolean; layoutId?: string; error?: string }> {
  try {
    const layoutId = await prisma.$transaction(async (tx) => {
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

      // Re-create sections and their seats
      for (const sec of input.sections) {
        const section = await tx.section.create({
          data: {
            layoutId: layout.id,
            name: sec.name,
            code: sec.code,
            shapeType: sec.shapeType,
            geometry: JSON.stringify(sec.geometry),
            price: sec.price,
            color: sec.color,
            rowCount: sec.rowCount,
            seatsPerRow: sec.seatsPerRow,
          },
        });

        let seatsToCreate = sec.seats;
        if (!seatsToCreate || seatsToCreate.length === 0) {
          if (sec.rowCount > 0 && sec.seatsPerRow > 0) {
            seatsToCreate = generateSeatGrid({
              geometry: sec.geometry,
              rowCount: sec.rowCount,
              seatsPerRow: sec.seatsPerRow,
            }) as any;
          } else {
            seatsToCreate = [];
          }
        }

        if (seatsToCreate && seatsToCreate.length > 0) {
          await tx.seat.createMany({
            data: seatsToCreate.map((s) => ({
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
    });

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
