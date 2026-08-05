import { NextResponse } from 'next/server';
import { getEvents } from '@/actions/getEvents';
import { prisma } from '@/lib/prisma';

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
    const { title, venueName, startTime, layoutId } = body;

    if (!title || !venueName || !startTime || !layoutId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
          venueName,
          startTime: new Date(startTime),
          layoutId,
          viewBoxWidth: layout.canvasWidth,
          viewBoxHeight: layout.canvasHeight,
        },
      });

      // 3. Clone sections and seats from layout to event
      for (const section of layout.sections) {
        const clonedSection = await tx.section.create({
          data: {
            eventId: event.id,
            name: section.name,
            code: section.code,
            shapeType: section.shapeType,
            geometry: section.geometry,
            price: section.price,
            color: section.color,
            rowCount: section.rowCount,
            seatsPerRow: section.seatsPerRow,
          },
        });

        if (section.seats && section.seats.length > 0) {
          await tx.seat.createMany({
            data: section.seats.map((seat) => ({
              sectionId: clonedSection.id,
              row: seat.row,
              number: seat.number,
              x: seat.x,
              y: seat.y,
              status: 'AVAILABLE',
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
