'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { SeatDTO } from '@/types/venue';

export async function getSectionSeats(sectionId: string): Promise<SeatDTO[]> {
  noStore(); // ponytail: force Next.js to never cache this Server Action
  // Find expired HELD reservations linked to seats in this section, release them
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
      seats: {
        some: {
          seat: { sectionId },
        },
      },
    },
    include: { seats: true },
  });

  if (expiredReservations.length > 0) {
    const expiredIds = Array.from(new Set(expiredReservations.map((r) => r.id))).sort();
    const seatIds = Array.from(new Set(expiredReservations.flatMap((r) => r.seats.map((rs) => rs.seatId)))).sort();

    await prisma.$transaction([
      prisma.reservation.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      }),
      prisma.seat.updateMany({
        where: { id: { in: seatIds }, status: 'HELD' },
        data: { status: 'AVAILABLE' },
      }),
    ]);
  }

  const seats = await prisma.seat.findMany({
    where: { sectionId },
    orderBy: [{ row: 'asc' }, { number: 'asc' }],
    include: { section: true },
  });

  return seats.map((s) => ({
    id: s.id,
    sectionId: s.sectionId,
    row: s.row,
    number: s.number,
    x: s.x,
    y: s.y,
    status: s.status as SeatDTO['status'],
    price: s.priceOverride ? Number(s.priceOverride) : Number(s.section.price),
  }));
}
