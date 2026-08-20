import { NextResponse } from 'next/server';
import { confirmBookingAction } from '@/actions/confirmBooking';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reservationId, userSessionId } = body;

    const result = await confirmBookingAction({ reservationId, userSessionId });

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          id: reservationId,
          status: 'CONFIRMED',
        },
      });
    } else {
      return NextResponse.json({ error: result.error ?? 'Confirm failed' }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/reservations/confirm] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
