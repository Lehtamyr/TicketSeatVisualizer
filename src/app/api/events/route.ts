import { NextResponse } from 'next/server';
import { getEvents } from '@/actions/getEvents';
import { prisma } from '@/lib/prisma';
import { CreateEventSchema } from '@/lib/schemas';

export async function GET() {
  try {
    const events = await getEvents();
    return NextResponse.json(events);
  } catch (err) {
    console.error('[api/events] GET error:', err);
    return NextResponse.json({ error: 'Failed to load events.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid event payload' },
        { status: 400 }
      );
    }

    const { title, description, venueName, startTime, endTime, layoutId } = parsed.data;

    // 1. Fetch layout including its sections and seats
    const layout = await prisma.venueLayout.findUnique({
      where: { id: layoutId },
      include: {
        sections: {
          include: {
            seats: true,
          },
        },
      },
    });

    if (!layout) {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }

    // 2. Create new Event in database
    const newEvent = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title,
          description: description?.trim() || null,
          venueName,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          layoutId,
          viewBoxWidth: layout.canvasWidth,
          viewBoxHeight: layout.canvasHeight,
        },
      });

      // 3. Clone sections and seats from layout to event
      for (const section of layout.sections) {
        const geom = typeof section.geometry === 'string' ? (() => { try { return JSON.parse(section.geometry); } catch { return {}; } })() : section.geometry;
        const isStage = section.shapeType === 'STAGE' || geom?.shapeType === 'STAGE';

        const clonedSection = await tx.section.create({
          data: {
            eventId: event.id,
            name: section.name,
            code: section.code,
            shapeType: isStage ? 'STAGE' : section.shapeType,
            geometry: typeof section.geometry === 'string' ? section.geometry : JSON.stringify(section.geometry),
            price: isStage ? 0 : section.price,
            color: section.color,
            rowCount: isStage ? 0 : section.rowCount,
            seatsPerRow: isStage ? 0 : section.seatsPerRow,
            pricingTierId: isStage ? null : section.pricingTierId,
          },
        });

        if (!isStage && section.seats && section.seats.length > 0) {
          await tx.seat.createMany({
            data: section.seats.map((seat) => ({
              sectionId: clonedSection.id,
              row: seat.row,
              number: seat.number,
              x: seat.x,
              y: seat.y,
              status: 'AVAILABLE',
              pricingTierId: seat.pricingTierId,
            })),
          });
        }
      }

      return event;
    });

    return NextResponse.json(
      {
        success: true,
        data: newEvent,
        message: 'Event created successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[api/events] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
