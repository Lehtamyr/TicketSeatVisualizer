import { prisma } from '@/lib/prisma';

export async function ensureE2eTestData() {
  // 1. Check or create test event
  let event = await prisma.event.findFirst({
    where: { id: 'event-concert-1' },
    include: {
      sections: {
        include: { seats: true },
      },
    },
  });

  if (!event) {
    // Create venue layout
    let layout = await prisma.venueLayout.findFirst();
    if (!layout) {
      layout = await prisma.venueLayout.create({
        data: {
          id: 'layout-stadium-1',
          name: 'E2E Main Stadium',
          canvasWidth: 1200,
          canvasHeight: 800,
        },
      });
    }

    // Create pricing tier
    let tier = await prisma.pricingTier.findFirst({ where: { layoutId: layout.id } });
    if (!tier) {
      tier = await prisma.pricingTier.create({
        data: {
          layoutId: layout.id,
          name: 'Standard VIP',
          color: '#3B82F6',
          basePrice: 150000,
        },
      });
    }

    event = await prisma.event.create({
      data: {
        id: 'event-concert-1',
        title: 'Home Sweet Loan Gala Premiere',
        venueName: 'Grand Theater Jakarta',
        startTime: new Date(Date.now() + 86400000 * 7),
        layoutId: layout.id,
        sections: {
          create: [
            {
              id: 'sec-rect-101',
              name: 'Main Hall',
              code: 'MAIN-1',
              shapeType: 'RECTANGLE',
              color: '#3B82F6',
              geometry: JSON.stringify({
                shapeType: 'RECTANGLE',
                points: [
                  { x: 100, y: 100 },
                  { x: 400, y: 100 },
                  { x: 400, y: 300 },
                  { x: 100, y: 300 },
                ],
              }),
              pricingTierId: tier.id,
              price: 150000,
              seats: {
                create: Array.from({ length: 10 }, (_, i) => ({
                  id: `seat-test-${i + 1}`,
                  row: 'A',
                  number: i + 1,
                  x: 120 + i * 25,
                  y: 150,
                  status: 'AVAILABLE',
                })),
              },
            },
          ],
        },
      },
      include: {
        sections: {
          include: { seats: true },
        },
      },
    });
  }

  // 2. Create or refresh active test reservation
  const testSeat = await prisma.seat.findFirst({
    where: { section: { eventId: event.id } },
  });

  if (testSeat) {
    await prisma.reservationSeat.deleteMany({
      where: { reservationId: 'res-e2e-active-001' },
    });
    await prisma.order.deleteMany({
      where: { reservationId: 'res-e2e-active-001' },
    });
    await prisma.reservation.deleteMany({
      where: { id: 'res-e2e-active-001' },
    });

    await prisma.reservation.create({
      data: {
        id: 'res-e2e-active-001',
        eventId: event.id,
        userSessionId: 'sess-e2e-tester',
        status: 'PENDING',
        totalAmount: 150000,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
        seats: {
          create: [
            {
              seatId: testSeat.id,
              priceLocked: 150000,
            },
          ],
        },
      },
    });
  }
}
