'use server';

import { prisma } from '@/lib/prisma';
import { LockSeatsInput, LockSeatsResult } from '@/types/venue';

export async function lockSeatsAction(input: LockSeatsInput): Promise<LockSeatsResult> {
  const { eventId, seatIds, userSessionId } = input;

  if (!seatIds.length) return { success: false, error: 'No seats selected.' };

  try {
    // SQLite-compatible: check availability then update in transaction
    const result = await prisma.$transaction(async (tx) => {
      const seats = await tx.seat.findMany({
        where: { id: { in: seatIds } },
        include: { section: true },
      });

      if (seats.length !== seatIds.length) {
        throw new Error('One or more seats not found.');
      }

      const unavailable = seats.filter((s) => s.status !== 'AVAILABLE');
      if (unavailable.length > 0) {
        throw new Error(`${unavailable.length} seat(s) are no longer available.`);
      }

      const derivedEventId = eventId || seats[0]?.section.eventId;
      if (!derivedEventId) {
        throw new Error('Event ID could not be determined.');
      }

      const totalAmount = seats.reduce((sum, s) => sum + (s.priceOverride ?? Number(s.section.price)), 0);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const reservation = await tx.reservation.create({
        data: {
          eventId: derivedEventId,
          userSessionId,
          status: 'PENDING',
          totalAmount,
          expiresAt,
          seats: {
            create: seats.map((s) => ({
              seatId: s.id,
              priceLocked: s.priceOverride ?? Number(s.section.price),
            })),
          },
        },
      });

      // Mark seats as HELD
      await tx.seat.updateMany({
        where: { id: { in: seatIds } },
        data: { status: 'HELD' },
      });

      return { reservationId: reservation.id, expiresAt };
    });

    return {
      success: true,
      reservationId: result.reservationId,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to lock seats.';
    return { success: false, error: message };
  }
}
