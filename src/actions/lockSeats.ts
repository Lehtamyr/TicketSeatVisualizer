'use server';

import { prisma } from '@/lib/prisma';
import { LockSeatsInput, LockSeatsResult } from '@/types/venue';
import { broadcastSeatUpdate } from '@/lib/seatBroadcaster';

export async function lockSeatsAction(input: LockSeatsInput): Promise<LockSeatsResult> {
  const { eventId, seatIds, userSessionId } = input;

  // If seatIds is empty or undefined, release all locks for this session
  if (!seatIds || !seatIds.length) {
    try {
      const releasedIds: string[] = [];
      await prisma.$transaction(async (tx) => {
        const existing = await tx.reservation.findMany({
          where: { userSessionId, eventId, status: 'PENDING' },
          include: { seats: true },
        });
        for (const res of existing) {
          const resSeatIds = res.seats.map((rs) => rs.seatId);
          releasedIds.push(...resSeatIds);
          await tx.reservation.update({
            where: { id: res.id },
            data: { status: 'EXPIRED' },
          });
          await tx.seat.updateMany({
            where: { id: { in: resSeatIds }, status: 'HELD' },
            data: { status: 'AVAILABLE' },
          });
        }
      });
      if (releasedIds.length > 0 && eventId) {
        broadcastSeatUpdate({
          eventId,
          seatIds: releasedIds,
          status: 'AVAILABLE',
          userSessionId,
        });
      }
      return { success: true };
    } catch (err) {
      console.error('[lockSeatsAction] Clear locks error:', err);
      return { success: false, error: 'Failed to clear cart locks.' };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Release existing pending reservations for this user session first
      const existing = await tx.reservation.findMany({
        where: { userSessionId, eventId, status: 'PENDING' },
        include: { seats: true },
      });
      for (const res of existing) {
        const resSeatIds = res.seats.map((rs) => rs.seatId);
        await tx.reservation.update({
          where: { id: res.id },
          data: { status: 'EXPIRED' },
        });
        await tx.seat.updateMany({
          where: { id: { in: resSeatIds }, status: 'HELD' },
          data: { status: 'AVAILABLE' },
        });
      }

      // 1.5 Force a write lock on the target seats (sqlite work-around for SELECT FOR UPDATE)
      await tx.seat.updateMany({
        where: { id: { in: seatIds } },
        data: { updatedAt: new Date() },
      });

      // 2. Check and lock new seats
      const seats = await tx.seat.findMany({
        where: { id: { in: seatIds } },
        include: { section: true },
      });
      if (seats.length !== seatIds.length) {
        throw new Error('One or more seats not found.');
      }
      const unavailable = seats.filter((s) => s.status !== 'AVAILABLE');
      if (unavailable.length > 0) {
        const err = new Error(`${unavailable.length} seat(s) are no longer available.`);
        (err as any).unavailableIds = unavailable.map((s) => s.id);
        throw err;
      }

      const derivedEventId = eventId || seats[0]?.section.eventId;
      if (!derivedEventId) throw new Error('Event ID could not be determined.');

      const totalAmount = seats.reduce((sum, s) => sum + (s.priceOverride ?? Number(s.section.price)), 0);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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

      const updated = await tx.seat.updateMany({
        where: { id: { in: seatIds }, status: 'AVAILABLE' },
        data: { status: 'HELD' },
      });
      if (updated.count !== seatIds.length) {
        throw new Error('One or more seats are already locked or reserved.');
      }

      return { reservationId: reservation.id, expiresAt, derivedEventId };
    });

    broadcastSeatUpdate({
      eventId: result.derivedEventId,
      seatIds,
      status: 'HELD',
      userSessionId,
    });

    return {
      success: true,
      reservationId: result.reservationId,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to lock seats.';
    const unavailableIds = (err as any)?.unavailableIds || [];
    return { success: false, error: message, unavailableIds };
  }
}
