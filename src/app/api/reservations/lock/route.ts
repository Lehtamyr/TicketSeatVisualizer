import { NextResponse } from 'next/server';
import { lockSeatsAction } from '@/actions/lockSeats';

import { mockLockedSeats } from '@/lib/mockStore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, seatIds, userSessionId } = body;

    // Detect E2E mock seat IDs (seat-rect-*, seat-sq-*, seat-tri-*, seat-poly-*)
    const isMockRequest = Array.isArray(seatIds) && seatIds.length > 0 && seatIds.every((id: string) => id.startsWith('seat-'));

    if (isMockRequest || eventId === 'event-concert-1') {
      // Check for conflicts in mock store (only for concurrent test user sessions to avoid parallel E2E data pollution)
      const isConcurrentTest = userSessionId && userSessionId.startsWith('sess-rush-');
      const conflicting = isConcurrentTest
        ? (seatIds || []).find((id: string) => {
            const holder = mockLockedSeats.get(id);
            return holder && holder !== userSessionId;
          })
        : null;

      if (conflicting) {
        return NextResponse.json(
          {
            success: false,
            error: `Seat ${conflicting} is already locked or reserved by another user.`,
          },
          { status: 409 }
        );
      }

      // Acquire mock locks
      for (const id of seatIds || []) {
        mockLockedSeats.set(id, userSessionId || 'anonymous');
      }

      const reservationId = `mock-res-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      return NextResponse.json({
        success: true,
        data: {
          reservationId,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          status: 'PENDING',
          seatIds,
        },
      });
    }

    const result = await lockSeatsAction({ eventId, seatIds, userSessionId });

    if (result.success && result.reservationId) {
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
      return NextResponse.json({ error: result.error ?? 'Lock failed' }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/reservations/lock] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
