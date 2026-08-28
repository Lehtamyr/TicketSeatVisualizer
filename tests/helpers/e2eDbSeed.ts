import { prisma } from '@/lib/prisma';

export async function ensureE2eTestData(targetReservationId = 'res-e2e-active-001') {
  // 1. Check or create test event with retry to handle sleeping serverless database instances (Neon)
  let event: any = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      event = await prisma.event.findFirst({
        where: { id: 'event-concert-1' },
        include: {
          sections: {
            include: { seats: true },
          },
        },
      });
      break;
    } catch (err: any) {
      if (attempts >= maxAttempts) {
        console.warn('[ensureE2eTestData] DB connection warning:', err?.message || err);
        return; // Don't crash test execution if database is unreachable; allow route mocks to handle it
      }
      // Wait 1.5s for Neon compute node to wake up from auto-suspend
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  try {
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
                  create: Array.from({ length: 20 }, (_, i) => ({
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

    if (!event) return;

    // Ensure a designated isolated seat exists specifically for this reservation
    const cleanId = targetReservationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
    const isolatedSeatId = `seat-${cleanId}`;
    let targetSection = event.sections?.[0] || (await prisma.section.findFirst({ where: { eventId: event.id } }));

    if (!targetSection) {
      targetSection = await prisma.section.findFirst();
    }
    if (!targetSection) return;

    // Clean up any stale records belonging to this target reservation or seat
    await prisma.order.deleteMany({
      where: { reservationId: targetReservationId },
    }).catch(() => {});
    await prisma.reservationSeat.deleteMany({
      where: { OR: [{ reservationId: targetReservationId }, { seatId: isolatedSeatId }] },
    }).catch(() => {});
    await prisma.reservation.deleteMany({
      where: { id: targetReservationId },
    }).catch(() => {});

    // Upsert the isolated seat for this reservation
    let testSeat = await prisma.seat.findUnique({
      where: { id: isolatedSeatId },
    });

    if (!testSeat) {
      // Find an unused seat number in section
      const maxSeat = await prisma.seat.findFirst({
        where: { sectionId: targetSection.id },
        orderBy: { number: 'desc' },
      });
      const seatNum = (maxSeat?.number || 1000) + Math.floor(Math.random() * 500) + 1;

      testSeat = await prisma.seat.create({
        data: {
          id: isolatedSeatId,
          sectionId: targetSection.id,
          row: 'Z',
          number: seatNum,
          x: 200,
          y: 200,
          status: 'AVAILABLE',
        },
      }).catch(async () => {
        // If seat creation had conflict on (sectionId, row, number), generate a random high number
        return await prisma.seat.create({
          data: {
            id: isolatedSeatId,
            sectionId: targetSection.id,
            row: `Z${Math.floor(Math.random() * 90) + 10}`,
            number: Math.floor(Math.random() * 90000) + 10000,
            x: 200,
            y: 200,
            status: 'AVAILABLE',
          },
        });
      });
    } else {
      // Reset seat status to AVAILABLE
      await prisma.seat.update({
        where: { id: isolatedSeatId },
        data: { status: 'AVAILABLE', heldBy: null },
      }).catch(() => {});
    }

    // Create fresh reservation with retry
    let created = false;
    for (let rAttempt = 0; rAttempt < 3; rAttempt++) {
      try {
        await prisma.reservation.create({
          data: {
            id: targetReservationId,
            eventId: event.id,
            userSessionId: `sess-${targetReservationId}`,
            status: 'PENDING',
            totalAmount: 150000,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 mins
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
        created = true;
        break;
      } catch (rErr) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }

    if (!created) {
      console.warn(`[ensureE2eTestData] Failed to create reservation ${targetReservationId} after retries`);
    }
  } catch (err: any) {
    console.warn('[ensureE2eTestData] Test data setup warning:', err?.message || err);
  }
}
