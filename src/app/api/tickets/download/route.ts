import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTicketsPdf } from '@/lib/pdf/ticketPdfGenerator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservationId');
    const orderId = searchParams.get('orderId');

    if (!reservationId && !orderId) {
      return NextResponse.json({ error: 'Missing reservationId or orderId parameter' }, { status: 400 });
    }

    // Find reservation with full relational hierarchy
    const reservation = await prisma.reservation.findFirst({
      where: reservationId ? { id: reservationId } : { orders: { some: { id: orderId! } } },
      include: {
        event: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        seats: {
          include: {
            seat: {
              include: {
                section: true,
                pricingTier: true,
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation or ticket not found' }, { status: 404 });
    }

    const order = reservation.orders[0];
    const orderNumber = order?.orderNumber || `TSV-${new Date().getFullYear()}-${reservation.id.slice(0, 6).toUpperCase()}`;
    const customerName = order?.customerName || 'Ticket Holder';
    const customerEmail = order?.customerEmail || 'customer@ticketseat.com';
    const orderDate = order?.paidAt || order?.createdAt || reservation.createdAt;

    const seats = reservation.seats.map((rs) => ({
      seatId: rs.seat.id,
      row: rs.seat.row,
      number: rs.seat.number,
      sectionName: rs.seat.section.name,
      sectionCode: rs.seat.section.code,
      tierName: rs.seat.pricingTier?.name || 'Standard',
      price: rs.priceLocked,
    }));

    const pdfBuffer = await generateTicketsPdf({
      orderNumber,
      orderDate,
      customerName,
      customerEmail,
      event: {
        title: reservation.event.title,
        venueName: reservation.event.venueName,
        startTime: reservation.event.startTime,
        termsAndConditions: reservation.event.termsAndConditions,
      },
      seats,
    });

    const pdfUint8Array = new Uint8Array(pdfBuffer);

    return new NextResponse(pdfUint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="E-Ticket-${orderNumber}.pdf"`,
        'Content-Length': String(pdfUint8Array.byteLength),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('[api/tickets/download] GET error:', err?.message || err, err?.stack);
    return NextResponse.json(
      {
        error: 'Failed to generate ticket PDF',
        message: process.env.NODE_ENV === 'development' ? err?.message : undefined,
      },
      { status: 500 }
    );
  }
}
