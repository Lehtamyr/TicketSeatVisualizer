import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getEventById } from '@/actions/getEvents';
import { prisma } from '@/lib/prisma';
import { CheckoutFormClient } from './CheckoutFormClient';

interface CheckoutPageProps {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ reservationId?: string }>;
}

export default async function EventCheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { eventId } = await params;
  const { reservationId } = await searchParams;

  if (!eventId) notFound();

  const event = await getEventById(eventId);
  if (!event) notFound();

  // If no reservationId provided in URL, redirect back to visualizer
  if (!reservationId) {
    redirect(`/events/${eventId}`);
  }

  // Fetch the active reservation from database
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
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

  // If reservation not found or not pending or expired, redirect back
  if (!reservation || reservation.status !== 'PENDING' || new Date(reservation.expiresAt) < new Date()) {
    redirect(`/events/${eventId}`);
  }

  // Serialize reservation data for client component
  const bookedSeats = reservation.seats.map((rs) => ({
    seatId: rs.seat.id,
    row: rs.seat.row,
    number: rs.seat.number,
    sectionName: rs.seat.section.name,
    sectionColor: rs.seat.section.color,
    tierName: rs.seat.pricingTier?.name || 'Standard',
    price: rs.priceLocked,
  }));

  const expiresAtIso = reservation.expiresAt.toISOString();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <CheckoutFormClient
        event={event}
        reservationId={reservation.id}
        bookedSeats={bookedSeats}
        totalAmount={reservation.totalAmount}
        expiresAtIso={expiresAtIso}
      />
    </div>
  );
}
