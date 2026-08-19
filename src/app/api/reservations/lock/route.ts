import { NextResponse } from 'next/server';
import { lockSeatsAction } from '@/actions/lockSeats';
import { LockSeatsInput } from '@/types/venue';

export async function POST(request: Request) {
  try {
    let body: Partial<LockSeatsInput> = {};
    try {
      body = await request.json();
    } catch {
      // Empty or invalid body
    }
    const { eventId, seatIds, userSessionId } = body;

    // All requests — browser or E2E — go through real DB-backed locking.
    // event-concert-1 is seeded in the DB with fixed IDs so E2E tests work correctly.
    const result = await lockSeatsAction({
      eventId: eventId ?? '',
      seatIds: seatIds ?? [],
      userSessionId: userSessionId ?? '',
    });

    if (result.success && !result.reservationId) {
      // Release-only operation (empty seatIds) — no reservation created
      return NextResponse.json({ success: true, data: { released: true } });
    } else if (result.success && result.reservationId) {
      return NextResponse.json({
        success: true,
        data: {
          reservationId: result.reservationId,
          expiresAt: result.expiresAt,
          status: 'PENDING',
          seatIds,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error ?? 'Lock failed',
          unavailableIds: result.unavailableIds,
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error('[api/reservations/lock] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
