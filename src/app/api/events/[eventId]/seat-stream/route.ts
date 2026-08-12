import { NextResponse } from 'next/server';
import { seatEvents } from '@/lib/seatBroadcaster';

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: any) => {
        if (data.eventId === eventId) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            // Controller closed or stream error
          }
        }
      };

      seatEvents.on('seat-update', listener);

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (e) {
          clearInterval(pingInterval);
        }
      }, 1500);

      request.signal.addEventListener('abort', () => {
        seatEvents.off('seat-update', listener);
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
