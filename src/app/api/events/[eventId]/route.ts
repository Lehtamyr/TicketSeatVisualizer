import { NextResponse } from 'next/server';
import { getEventById } from '@/actions/getEvents';

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (err) {
    console.error('[api/events/[eventId]] GET error:', err);
    return NextResponse.json({ error: 'Failed to load event.' }, { status: 500 });
  }
}
