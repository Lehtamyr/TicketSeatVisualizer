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
      const pricingTier = s.pricingTier || e.layout?.pricingTiers?.find((t) => t.id === s.pricingTierId);
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        shapeType: (isStage ? 'STAGE' : s.shapeType) as SectionDTO['shapeType'],
        geometry: geom,
        price: isStage ? 0 : Number(s.price),
        color: isStage ? '#64748B' : (s.color || pricingTier?.color || '#3B82F6'),
        pricingTierId: isStage ? null : (s.pricingTierId ?? pricingTier?.id ?? null),
        pricingTier: pricingTier ?? undefined,
        tierId: isStage ? undefined : (s.pricingTierId ?? pricingTier?.id ?? undefined),
        tierName: isStage ? undefined : pricingTier?.name,
        tierColor: isStage ? undefined : pricingTier?.color,
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
      const pricingTier = s.pricingTier || event.layout?.pricingTiers?.find((t) => t.id === s.pricingTierId);
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        shapeType: (isStage ? 'STAGE' : s.shapeType) as SectionDTO['shapeType'],
        geometry: geom,
        price: isStage ? 0 : Number(s.price),
        color: isStage ? '#64748B' : (s.color || pricingTier?.color || '#3B82F6'),
        pricingTierId: isStage ? null : (s.pricingTierId ?? pricingTier?.id ?? null),
        pricingTier: pricingTier ?? undefined,
        tierId: isStage ? undefined : (s.pricingTierId ?? pricingTier?.id ?? undefined),
        tierName: isStage ? undefined : pricingTier?.name,
        tierColor: isStage ? undefined : pricingTier?.color,
        totalSeats: isStage ? 0 : s._count.seats,
        availableSeats: isStage ? 0 : s.seats.length,
      };
    }),
  };
}
