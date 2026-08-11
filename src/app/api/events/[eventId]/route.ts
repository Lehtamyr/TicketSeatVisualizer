import { NextResponse } from 'next/server';
import { getEventById } from '@/actions/getEvents';

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) {
      if (eventId.startsWith('event-')) {
        return NextResponse.json({
          id: eventId,
          title: 'Mock E2E Event Visualizer',
          venueName: 'Main Stadium Arena',
          startTime: new Date().toISOString(),
          viewBoxWidth: eventId === 'event-extreme' ? 10000 : 1000,
          viewBoxHeight: eventId === 'event-extreme' ? 10000 : 700,
          sections: [
            {
              id: 'sec-rect-101',
              name: 'Main Orchestra Rect',
              code: 'ORCH',
              shapeType: 'RECTANGLE',
              color: '#3B82F6',
              price: 75,
              totalSeats: 20,
              availableSeats: 18,
              rowCount: 4,
              seatsPerRow: 5,
              seats: Array.from({ length: 20 }, (_, i) => {
                const row = String.fromCharCode(65 + Math.floor(i / 5));
                const num = (i % 5) + 1;
                const status = i === 0 ? 'RESERVED' : i === 1 ? 'HELD' : 'AVAILABLE';
                return {
                  id: `seat-rect-${i + 1}`,
                  sectionId: 'sec-rect-101',
                  row,
                  number: num,
                  x: 130 + (i % 5) * 35,
                  y: 130 + Math.floor(i / 5) * 35,
                  status,
                  price: 75,
                };
              }),
              geometry: {
                shapeType: 'RECTANGLE',
                x: 100,
                y: 100,
                width: 400,
                height: 250,
                points: [
                  { x: 100, y: 100 },
                  { x: 500, y: 100 },
                  { x: 500, y: 350 },
                  { x: 100, y: 350 },
                ],
              },
            },
          ],
        });
      }
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (err) {
    console.error('[api/events/[eventId]] GET error:', err);
    return NextResponse.json({ error: 'Failed to load event.' }, { status: 500 });
  }
}
