'use server';

import { prisma } from '@/lib/prisma';
import { EventDTO, SectionDTO, SectionGeometry } from '@/types/venue';

function parseGeometry(raw: unknown): SectionGeometry {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as SectionGeometry; } catch { /* fall through */ }
  }
  return raw as SectionGeometry;
}

export async function getEvents(): Promise<EventDTO[]> {
  const events = await prisma.event.findMany({
    orderBy: { startTime: 'asc' },
    include: {
      sections: {
        include: {
          pricingTier: true,
          _count: { select: { seats: true } },
          seats: {
            where: { status: 'AVAILABLE' },
            select: { id: true },
          },
        },
      },
    },
  });

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    venueName: e.venueName,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime?.toISOString() ?? null,
    viewBoxWidth: e.viewBoxWidth,
    viewBoxHeight: e.viewBoxHeight,
    sections: e.sections.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      shapeType: s.shapeType as SectionDTO['shapeType'],
      geometry: parseGeometry(s.geometry),
      price: Number(s.price),
      color: s.color,
      tierName: s.pricingTier?.name,
      tierColor: s.pricingTier?.color,
      totalSeats: s._count.seats,
      availableSeats: s.seats.length,
    })),
  }));
}

export async function getEventById(eventId: string): Promise<EventDTO | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      sections: {
        include: {
          pricingTier: true,
          _count: { select: { seats: true } },
          seats: {
            where: { status: 'AVAILABLE' },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    venueName: event.venueName,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime?.toISOString() ?? null,
    viewBoxWidth: event.viewBoxWidth,
    viewBoxHeight: event.viewBoxHeight,
    sections: event.sections.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      shapeType: s.shapeType as SectionDTO['shapeType'],
      geometry: parseGeometry(s.geometry),
      price: Number(s.price),
      color: s.color,
      tierName: s.pricingTier?.name,
      tierColor: s.pricingTier?.color,
      totalSeats: s._count.seats,
      availableSeats: s.seats.length,
    })),
  };
}
