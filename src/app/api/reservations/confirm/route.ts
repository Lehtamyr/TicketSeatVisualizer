import { NextResponse } from 'next/server';
import { confirmBookingAction } from '@/actions/confirmBooking';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reservationId, userSessionId, buyerInfo, paymentMethod } = body;

    const result = await confirmBookingAction({
      reservationId,
      userSessionId,
      buyerInfo,
      paymentMethod,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          id: reservationId,
          orderId: result.orderId,
          orderNumber: result.orderNumber,
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
