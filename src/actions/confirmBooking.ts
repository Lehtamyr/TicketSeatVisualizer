'use server';

import { prisma } from '@/lib/prisma';
import { ConfirmBookingInput, ConfirmBookingResult } from '@/types/venue';
import { ConfirmBookingSchema } from '@/lib/schemas';
import { getOrCreateSessionId } from '@/lib/session';

export async function confirmBookingAction(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
  const parsed = ConfirmBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { reservationId } = parsed.data;
  const effectiveSessionId = await getOrCreateSessionId(input.userSessionId);

  try {
    await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { seats: true },
      });

      if (!reservation) throw new Error('Reservation not found.');
      if (reservation.userSessionId !== effectiveSessionId) throw new Error('Unauthorized.');
      if (reservation.status !== 'PENDING') throw new Error('Reservation is not pending.');
      if (reservation.expiresAt < new Date()) throw new Error('Reservation has expired.');

      const seatIds = reservation.seats.map((rs) => rs.seatId);

      // Mark reservation confirmed
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'CONFIRMED' },
      });

      // Mark seats as RESERVED permanently
      await tx.seat.updateMany({
        where: { id: { in: seatIds } },
        data: { status: 'RESERVED' },
      });
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to confirm booking.' };
  }
}
