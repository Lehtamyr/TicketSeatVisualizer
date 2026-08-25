'use server';

import { prisma } from '@/lib/prisma';
import { EventDTO, SectionDTO, SectionGeometry } from '@/types/venue';
import { parseGeometry } from '@/lib/parseGeometry';

export async function getEvents(): Promise<EventDTO[]> {
  const events = await prisma.event.findMany({
    orderBy: { startTime: 'asc' },
    include: {
      layout: { include: { pricingTiers: true } },
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
    layout: e.layout,
    sections: e.sections.map((s) => {
      const geom = parseGeometry(s.geometry);
      const isStage = s.shapeType === 'STAGE' || geom?.shapeType === 'STAGE';
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        shapeType: (isStage ? 'STAGE' : s.shapeType) as SectionDTO['shapeType'],
        geometry: geom,
        price: isStage ? 0 : Number(s.price),
        color: s.color,
        tierId: isStage ? undefined : (s.pricingTierId ?? s.pricingTier?.id ?? undefined),
        tierName: isStage ? undefined : s.pricingTier?.name,
        tierColor: isStage ? undefined : s.pricingTier?.color,
        totalSeats: isStage ? 0 : s._count.seats,
        availableSeats: isStage ? 0 : s.seats.length,
      };
    }),
  }));
}

export async function getEventById(eventId: string): Promise<EventDTO | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      layout: { include: { pricingTiers: true } },
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
    termsAndConditions: event.termsAndConditions,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime?.toISOString() ?? null,
    viewBoxWidth: event.viewBoxWidth,
    viewBoxHeight: event.viewBoxHeight,
    layout: event.layout,
    sections: event.sections.map((s) => {
      const geom = parseGeometry(s.geometry);
      const isStage = s.shapeType === 'STAGE' || geom?.shapeType === 'STAGE';
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        shapeType: (isStage ? 'STAGE' : s.shapeType) as SectionDTO['shapeType'],
        geometry: geom,
        price: isStage ? 0 : Number(s.price),
        color: s.color,
        tierId: isStage ? undefined : (s.pricingTierId ?? s.pricingTier?.id ?? undefined),
        tierName: isStage ? undefined : s.pricingTier?.name,
        tierColor: isStage ? undefined : s.pricingTier?.color,
        totalSeats: isStage ? 0 : s._count.seats,
        availableSeats: isStage ? 0 : s.seats.length,
      };
    }),
  };
}
