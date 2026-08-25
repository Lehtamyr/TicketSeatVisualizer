import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getEventById } from '@/actions/getEvents';
import { prisma } from '@/lib/prisma';
import { ConfirmationClient } from './ConfirmationClient';

interface ConfirmationPageProps {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ reservationId?: string; method?: string }>;
}

export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const { eventId } = await params;
  const { reservationId, method } = await searchParams;

  if (!eventId || !reservationId) {
    redirect(`/events/${eventId || ''}`);
  }

  const event = await getEventById(eventId);
  if (!event) notFound();

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

  if (!reservation || reservation.status !== 'PENDING' || new Date(reservation.expiresAt) < new Date()) {
    redirect(`/events/${eventId}`);
  }

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
      <ConfirmationClient
        event={event}
        reservationId={reservation.id}
        bookedSeats={bookedSeats}
        totalAmount={reservation.totalAmount}
        expiresAtIso={expiresAtIso}
        paymentMethod={method || 'QRIS'}
      />
    </div>
  );
}
