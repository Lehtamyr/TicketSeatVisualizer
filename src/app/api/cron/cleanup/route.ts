import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cron cleanup logic
async function runCleanup() {

  const now = new Date();

  // Find expired pending reservations
  const expired = await prisma.reservation.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    include: { seats: true },
  });

  if (expired.length === 0) {
    return { message: 'No expired reservations.', count: 0 };
  }

  const seatIds = expired.flatMap((r) => r.seats.map((rs) => rs.seatId));
  const reservationIds = expired.map((r) => r.id);

  await prisma.$transaction([
    prisma.reservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { status: 'EXPIRED' },
    }),
    prisma.seat.updateMany({
      where: { id: { in: seatIds }, status: 'HELD' },
      data: { status: 'AVAILABLE' },
    }),
  ]);

  return { message: 'Expired reservations cleaned up.', count: expired.length };
}

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Allowed in dev/test if secret not configured

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get('secret') === secret) return true;

  return false;
}

// Cron cleanup: expire PENDING reservations & release HELD seats (via GET or POST)
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCleanup();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/cleanup] GET Error:', err);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCleanup();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/cleanup] POST Error:', err);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }
}
