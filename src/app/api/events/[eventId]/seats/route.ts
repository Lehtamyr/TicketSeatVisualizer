import { NextResponse } from 'next/server';
import { getSectionSeats } from '@/actions/getSectionSeats';

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await params; // consume params (eventId not needed — sectionId is the lookup key)
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get('sectionId');

    if (!sectionId) {
      return NextResponse.json({ error: 'sectionId is required' }, { status: 400 });
    }

    // Always query the real DB — event-concert-1 is now seeded with fixed IDs
    const seats = await getSectionSeats(sectionId);
    return NextResponse.json({ success: true, seats: seats ?? [] });
  } catch (err) {
    console.error('[api/events/[eventId]/seats] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
