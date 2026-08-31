'use server';

import { prisma, TransactionClient } from '@/lib/prisma';
import { LockSeatsInput, LockSeatsResult } from '@/types/venue';
import { broadcastSeatUpdate } from '@/lib/seatBroadcaster';
import { LockSeatsSchema } from '@/lib/schemas';
import { getOrCreateSessionId } from '@/lib/session';

const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

class SeatUnavailableError extends Error {
  unavailableIds: string[];
  constructor(message: string, unavailableIds: string[]) {
    super(message);
    this.name = 'SeatUnavailableError';
    this.unavailableIds = unavailableIds;
  }
}

/**
 * Releases existing pending reservations and their held seats for a given user session,
 * returning the list of released seat IDs.
 */
async function releasePendingReservations(
  tx: TransactionClient,
  userSessionId: string,
  eventId?: string
): Promise<string[]> {
  const existing = await tx.reservation.findMany({
    where: { userSessionId, ...(eventId ? { eventId } : {}), status: 'PENDING' },
    include: { seats: true },
  });

  const releasedIds: string[] = [];
  for (const res of existing) {
    const resSeatIds = res.seats.map((rs) => rs.seatId).sort();
    releasedIds.push(...resSeatIds);
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: 'EXPIRED' },
    });
    if (resSeatIds.length > 0) {
      await tx.seat.updateMany({
        where: { id: { in: resSeatIds } },
        data: { status: 'AVAILABLE' },
      });
    }
  }
  return Array.from(new Set(releasedIds)).sort();
}

async function executeLockTransaction(
  eventId: string,
  sortedSeatIds: string[],
  userSessionId: string
) {
  return await prisma.$transaction(
    async (tx) => {
      // 1. Find existing pending reservations for this user session
      const existingReservations = await tx.reservation.findMany({
        where: { userSessionId, ...(eventId ? { eventId } : {}), status: 'PENDING' },
        include: { seats: true },
      });

      const currentHeldSeatIds = new Set(
        existingReservations.flatMap((r) => r.seats.map((s) => s.seatId))
      );

      // Expire old pending reservations
      if (existingReservations.length > 0) {
        await tx.reservation.updateMany({
          where: { id: { in: existingReservations.map((r) => r.id) } },
          data: { status: 'EXPIRED' },
        });
      }

      // Delta calculation: seats to release vs seats to newly hold
      const newSeatIdSet = new Set(sortedSeatIds);
      const toRelease = Array.from(currentHeldSeatIds).filter((id) => !newSeatIdSet.has(id)).sort();
      const toHold = sortedSeatIds.filter((id) => !currentHeldSeatIds.has(id)).sort();

      // Release deselected seats
      if (toRelease.length > 0) {
        await tx.seat.updateMany({
          where: { id: { in: toRelease } },
          data: { status: 'AVAILABLE' },
        });
      }

      // 2. Fetch target seats in deterministic sorted order
      const seats = await tx.seat.findMany({
        where: { id: { in: sortedSeatIds } },
        orderBy: { id: 'asc' },
        include: {
          section: true,
          reservationSeats: {
            include: {
              reservation: true,
            },
          },
        },
      });

      if (seats.length !== sortedSeatIds.length) {
        throw new Error('One or more seats not found.');
      }

      const now = new Date();
      const unavailable = seats.filter((s) => {
        if (s.status === 'RESERVED') return true;
        // Check if seat is held in an active PENDING reservation by someone else
        const activeHoldByOther = s.reservationSeats.some(
          (rs) =>
            rs.reservation.status === 'PENDING' &&
            rs.reservation.expiresAt > now &&
            rs.reservation.userSessionId !== userSessionId
        );
        return activeHoldByOther;
      });

      if (unavailable.length > 0) {
        throw new SeatUnavailableError(
          `${unavailable.length} seat(s) are no longer available.`,
          unavailable.map((s) => s.id)
        );
      }

      const derivedEventId = eventId || seats[0]?.section.eventId;
      if (!derivedEventId) throw new Error('Event ID could not be determined.');

      const totalAmount = seats.reduce(
        (sum, s) => sum + (s.priceOverride ?? Number(s.section.price)),
        0
      );
      const expiresAt = new Date(Date.now() + LOCK_DURATION_MS);

      // Create new reservation
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

      // Update newly held seats to HELD
      if (toHold.length > 0) {
        await tx.seat.updateMany({
          where: { id: { in: toHold } },
          data: { status: 'HELD' },
        });
      }

      return { reservationId: reservation.id, expiresAt, derivedEventId, releasedSeatIds: toRelease };
    },
    {
      maxWait: 10000,
      timeout: 15000,
    }
  );
}

export async function lockSeatsAction(input: LockSeatsInput): Promise<LockSeatsResult> {
  const userSessionId = await getOrCreateSessionId(input.userSessionId);

  // If seatIds is empty or undefined, release all locks for this session
  if (!input.seatIds || !input.seatIds.length) {
    try {
      const releasedIds = await prisma.$transaction(
        (tx) => releasePendingReservations(tx, userSessionId, input.eventId),
        { maxWait: 10000, timeout: 15000 }
      );

      if (releasedIds.length > 0 && input.eventId) {
        broadcastSeatUpdate({
          eventId: input.eventId,
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

  const parsed = LockSeatsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { eventId, seatIds } = parsed.data;
  // Always sort seat IDs deterministically to prevent PostgreSQL deadlocks (40P01)
  const sortedSeatIds = Array.from(new Set(seatIds)).sort();

  // Retry up to 3 times on transient PostgreSQL deadlocks or connection timeouts
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      const result = await executeLockTransaction(eventId, sortedSeatIds, userSessionId);

      if (result.releasedSeatIds && result.releasedSeatIds.length > 0) {
        broadcastSeatUpdate({
          eventId: result.derivedEventId,
          seatIds: result.releasedSeatIds,
          status: 'AVAILABLE',
          userSessionId,
        });
      }

      broadcastSeatUpdate({
        eventId: result.derivedEventId,
        seatIds: sortedSeatIds,
        status: 'HELD',
        userSessionId,
      });

      return {
        success: true,
        reservationId: result.reservationId,
        expiresAt: result.expiresAt.toISOString(),
      };
    } catch (err: unknown) {
      if (err instanceof SeatUnavailableError) {
        return { success: false, error: err.message, unavailableIds: err.unavailableIds };
      }

      const isDeadlock = err instanceof Error && (err.message.includes('40P01') || err.message.includes('deadlock'));
      const isTransient = isDeadlock || (err instanceof Error && (err.message.includes('connection') || err.message.includes('timeout') || err.message.includes('ETIMEDOUT') || err.message.includes('P2024') || err.message.includes('P2028') || err.message.includes('closed')));

      if (isTransient && attempts < 3) {
        // Exponential backoff retry
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }

      const message = err instanceof Error ? err.message : 'Failed to lock seats.';
      return { success: false, error: message, unavailableIds: [] };
    }
  }

  return { success: false, error: 'Failed to acquire seat locks due to high concurrency.' };
}
