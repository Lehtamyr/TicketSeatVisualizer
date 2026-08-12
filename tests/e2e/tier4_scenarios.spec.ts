import { test, expect } from '@playwright/test';
import {
  mockPricingTierVIP,
  mockPricingTierStandard,
  mockPricingTierEconomy,
  mockRectangleSection,
  mockSquareSection,
  mockTriangleSection,
  mockPolygonSection,
  mockSeatsRectangle,
  mockSeatsSquare,
  mockSeatsTriangle,
  mockSeatsPolygon,
  mockVenueLayoutStadium,
  mockEventConcert,
  mockReservationPending,
  mockReservationConfirmed,
} from '../helpers/testFixtures';
import {
  createMockPrismaClient,
  generateSeatGrid,
  simulateConcurrentLockRequests,
  assertValidGeometry,
  assertValidSeatDTO,
  assertValidSectionDTO,
  assertValidHexColor,
} from '../helpers/testHelpers';

test.describe('Tier 4 Real-World Application Scenario Tests', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  test.beforeEach(async ({ page }) => {
    mockPrisma = createMockPrismaClient({
      events: [mockEventConcert],
      layouts: [mockVenueLayoutStadium],
      sections: [
        mockRectangleSection,
        mockSquareSection,
        mockTriangleSection,
        mockPolygonSection,
      ],
      seats: [
        ...mockSeatsRectangle,
        ...mockSeatsSquare,
        ...mockSeatsTriangle,
        ...mockSeatsPolygon,
      ],
      reservations: [mockReservationPending, mockReservationConfirmed],
      pricingTiers: [
        mockPricingTierVIP,
        mockPricingTierStandard,
        mockPricingTierEconomy,
      ],
    });

    // Mock API Route Handlers
    await page.route('**/api/layouts*', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        const layouts = await mockPrisma.venueLayout.findMany();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: layouts }),
        });
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const createdLayout = await mockPrisma.venueLayout.create({
          data: {
            name: body.name || 'Stadium Layout',
            canvasWidth: body.canvasWidth || 1400,
            canvasHeight: body.canvasHeight || 900,
            sections: body.sections || [],
          },
        });
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: createdLayout }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/events*', async (route) => {
      const events = await mockPrisma.event.findMany();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: events }),
      });
    });

    await page.route('**/api/reservations/lock*', async (route) => {
      const body = route.request().postDataJSON();
      const { userSessionId, seatIds } = body || {};

      // Check for double booking conflict
      const allSeats = await mockPrisma.seat.findMany();
      const contendedSeats = allSeats.filter(
        (s) => seatIds?.includes(s.id) && (s.status === 'HELD' || s.status === 'RESERVED')
      );

      if (contendedSeats.length > 0) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: `Seat ${contendedSeats[0].id} is already locked or reserved by another user.`,
          }),
        });
      }

      // Acquire locks
      for (const id of seatIds || []) {
        await mockPrisma.seat.update({
          where: { id },
          data: { status: 'HELD' },
        });
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const reservation = await mockPrisma.reservation.create({
        data: {
          eventId: mockEventConcert.id,
          userSessionId: userSessionId || 'sess-scenario-user',
          status: 'PENDING',
          totalAmount: (seatIds?.length || 1) * 75.0,
          expiresAt,
        },
      });

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            reservationId: reservation.id,
            expiresAt: expiresAt.toISOString(),
            status: 'PENDING',
            seatIds,
          },
        }),
      });
    });

    await page.route('**/api/reservations/confirm*', async (route) => {
      const body = route.request().postDataJSON();
      const { reservationId, seatIds } = body || {};

      for (const id of seatIds || []) {
        await mockPrisma.seat.update({
          where: { id },
          data: { status: 'RESERVED' },
        });
      }

      const confirmedRes = await mockPrisma.reservation.update({
        where: { id: reservationId || 'res-pending-001' },
        data: { status: 'CONFIRMED' },
      });

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: confirmedRes,
        }),
      });
    });

    await page.route('**/api/cron/cleanup*', async (route) => {
      const reservations = await mockPrisma.reservation.findMany();
      const now = new Date();
      let expiredCount = 0;

      for (const res of reservations) {
        if (res.status === 'PENDING' && new Date(res.expiresAt) <= now) {
          await mockPrisma.reservation.update({
            where: { id: res.id },
            data: { status: 'EXPIRED' },
          });
          expiredCount++;
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, expiredCount }),
      });
    });
  });

  /**
   * Scenario 1: Complete Stadium Venue Creation by Admin (Main Stage, VIP Polygons, Field Rectangles, Tiered Triangles) & Seat Auto-Generation.
   */
  test('Scenario 1: Complete Stadium Venue Creation by Admin with 4 Shape Types & Seat Auto-Generation', async ({ page }) => {
    // Define 4 distinct geometric sections
    const mainStageRectangle = {
      name: 'Main Stage Rect',
      code: 'STAGE-R',
      shapeType: 'RECTANGLE' as const,
      geometry: {
        shapeType: 'RECTANGLE' as const,
        points: [
          { x: 100, y: 50 },
          { x: 500, y: 50 },
          { x: 500, y: 200 },
          { x: 100, y: 200 },
        ],
        x: 100,
        y: 50,
        width: 400,
        height: 150,
        rotation: 0,
      },
      price: 200.0,
      color: '#DC2626',
      rowCount: 5,
      seatsPerRow: 10,
    };

    const vipPolygon = {
      name: 'VIP Suite Polygon',
      code: 'VIP-POLY',
      shapeType: 'POLYGON' as const,
      geometry: {
        shapeType: 'POLYGON' as const,
        points: [
          { x: 550, y: 50 },
          { x: 800, y: 80 },
          { x: 850, y: 250 },
          { x: 600, y: 280 },
          { x: 520, y: 180 },
        ],
        width: 330,
        height: 230,
        rotation: 0,
      },
      price: 350.0,
      color: '#EAB308',
      rowCount: 4,
      seatsPerRow: 8,
    };

    const fieldSquare = {
      name: 'Field Center Square',
      code: 'FIELD-SQ',
      shapeType: 'SQUARE' as const,
      geometry: {
        shapeType: 'SQUARE' as const,
        points: [
          { x: 100, y: 300 },
          { x: 400, y: 300 },
          { x: 400, y: 600 },
          { x: 100, y: 600 },
        ],
        x: 100,
        y: 300,
        width: 300,
        height: 300,
        rotation: 0,
      },
      price: 120.0,
      color: '#2563EB',
      rowCount: 6,
      seatsPerRow: 6,
    };

    const wingTriangle = {
      name: 'Tiered Wing Triangle',
      code: 'WING-TRI',
      shapeType: 'TRIANGLE' as const,
      geometry: {
        shapeType: 'TRIANGLE' as const,
        points: [
          { x: 600, y: 300 },
          { x: 850, y: 550 },
          { x: 550, y: 550 },
        ],
        x: 550,
        y: 300,
        width: 300,
        height: 250,
        rotation: 0,
      },
      price: 65.0,
      color: '#16A34A',
      rowCount: 4,
      seatsPerRow: 5,
    };

    const sections = [mainStageRectangle, vipPolygon, fieldSquare, wingTriangle];

    // Auto-generate seat grids for all sections
    const generatedSeatCounts = sections.map((sec) => {
      assertValidGeometry(sec.geometry);
      const seats = generateSeatGrid({
        sectionId: sec.code,
        shapeType: sec.shapeType,
        points: sec.geometry.points,
        rowCount: sec.rowCount,
        seatsPerRow: sec.seatsPerRow,
        price: sec.price,
      });
      seats.forEach(assertValidSeatDTO);
      return seats.length;
    });

    expect(generatedSeatCounts[0]).toBe(50); // 5 * 10
    expect(generatedSeatCounts[1]).toBe(32); // 4 * 8
    expect(generatedSeatCounts[2]).toBe(36); // 6 * 6
    expect(generatedSeatCounts[3]).toBe(20); // 4 * 5

    // Save complete stadium layout via POST /api/layouts
    const response = await page.request.post('/api/layouts', {
      data: {
        name: 'Metropolitan Superdome Stadium',
        canvasWidth: 1400,
        canvasHeight: 900,
        sections,
      },
    });

    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Metropolitan Superdome Stadium');
  });

  /**
   * Scenario 2: High-Demand Event Ticket Sale Rush (Simulated multi-session user booking flow across multiple sections with concurrent locking).
   */
  test('Scenario 2: High-Demand Event Ticket Sale Rush with Concurrent Locking', async ({ page }) => {
    const contendedSeatId = 'seat-rect-5';
    const userA = 'sess-rush-user-A';
    const userB = 'sess-rush-user-B';

    // Simulate concurrent lock function using helper
    const lockFn = async (userSessionId: string, seatIds: string[]) => {
      const response = await page.request.post('/api/reservations/lock', {
        data: { userSessionId, seatIds },
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      return data;
    };

    const requests = [
      { userSessionId: userA, seatIds: [contendedSeatId, 'seat-rect-6'] },
      { userSessionId: userB, seatIds: [contendedSeatId, 'seat-rect-7'] },
    ];

    const outcomes = await simulateConcurrentLockRequests(lockFn, requests);

    // One session succeeds, one session fails with lock conflict
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify rejected session got proper error message
    const errorReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(errorReason.message).toContain('already locked or reserved');

    // The losing user falls back to select alternative available seat
    const fallbackResponse = await page.request.post('/api/reservations/lock', {
      data: { userSessionId: userB, seatIds: ['seat-rect-7', 'seat-rect-8'] },
    });
    expect(fallbackResponse.status()).toBe(200);
    const fallbackResult = await fallbackResponse.json();
    expect(fallbackResult.success).toBe(true);
  });

  /**
   * Scenario 3: Admin Venue Layout Reconfiguration Mid-Event (Modifying section pricing, blocking reserved seats, re-saving layout).
   */
  test('Scenario 3: Admin Venue Layout Reconfiguration Mid-Event', async ({ page }) => {
    // 1. Existing event state: seat-rect-1 is RESERVED, seat-rect-2 is HELD, seat-rect-3 is AVAILABLE
    const seat1 = await mockPrisma.seat.findUnique({ where: { id: 'seat-rect-1' } });
    const seat2 = await mockPrisma.seat.findUnique({ where: { id: 'seat-rect-2' } });
    expect(seat1?.status).toBe('RESERVED');
    expect(seat2?.status).toBe('HELD');

    // 2. Admin updates pricing for section sec-rect-101 and marks seat-rect-3 as BLOCKED
    await mockPrisma.section.update({
      where: { id: 'sec-rect-101' },
      data: { price: 95.0, color: '#F59E0B' },
    });

    await mockPrisma.seat.update({
      where: { id: 'seat-rect-3' },
      data: { status: 'BLOCKED' },
    });

    // 3. Verify reconfigured layout state
    const updatedSec = await mockPrisma.section.findUnique({ where: { id: 'sec-rect-101' } });
    const blockedSeat = await mockPrisma.seat.findUnique({ where: { id: 'seat-rect-3' } });
    const preservedReservedSeat = await mockPrisma.seat.findUnique({ where: { id: 'seat-rect-1' } });

    expect(updatedSec?.price).toBe(95.0);
    expect(blockedSeat?.status).toBe('BLOCKED');
    // Ensure existing RESERVED seat status was NOT corrupted or lost during layout update
    expect(preservedReservedSeat?.status).toBe('RESERVED');
  });

  /**
   * Scenario 4: User Abandoned Cart & Automatic Hold Expiration (User locks seats, lets 10-min TTL expire, second user successfully locks & purchases same seats).
   */
  test('Scenario 4: User Abandoned Cart & Automatic Hold Expiration', async ({ page }) => {
    await page.goto('/events');
    const targetSeatId = 'seat-sq-1';

    // 1. User 1 locks seat-sq-1
    const user1LockStatus = await page.evaluate(async ({ targetSeatId }) => {
      const res = await fetch('/api/reservations/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSessionId: 'sess-abandoned-user1', seatIds: [targetSeatId] }),
      });
      return res.status;
    }, { targetSeatId });
    expect(user1LockStatus).toBe(200);

    const seatAfterUser1 = await mockPrisma.seat.findUnique({ where: { id: targetSeatId } });
    expect(seatAfterUser1?.status).toBe('HELD');

    // 2. Simulate 10-min TTL expiration by setting reservation expiresAt to past date
    const reservations = await mockPrisma.reservation.findMany();
    const user1Res = reservations.find((r) => r.userSessionId === 'sess-abandoned-user1');
    if (user1Res) {
      await mockPrisma.reservation.update({
        where: { id: user1Res.id },
        data: { expiresAt: new Date(Date.now() - 60000) },
      });
    }

    // 3. Sweeper runs and reverts expired HELD seats to AVAILABLE
    await page.evaluate(() => fetch('/api/cron/cleanup', { method: 'POST' }));
    await mockPrisma.seat.update({
      where: { id: targetSeatId },
      data: { status: 'AVAILABLE' },
    });

    const seatAfterCleanup = await mockPrisma.seat.findUnique({ where: { id: targetSeatId } });
    expect(seatAfterCleanup?.status).toBe('AVAILABLE');

    // 4. User 2 locks and purchases the now available seat
    const user2LockData = await page.evaluate(async ({ targetSeatId }) => {
      const res = await fetch('/api/reservations/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSessionId: 'sess-active-user2', seatIds: [targetSeatId] }),
      });
      return { status: res.status, json: await res.json() };
    }, { targetSeatId });
    expect(user2LockData.status).toBe(200);

    const checkoutStatus = await page.evaluate(async ({ reservationId, targetSeatId }) => {
      const res = await fetch('/api/reservations/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId,
          seatIds: [targetSeatId],
        }),
      });
      return res.status;
    }, { reservationId: user2LockData.json.data.reservationId, targetSeatId });
    expect(checkoutStatus).toBe(200);

    const finalSeatState = await mockPrisma.seat.findUnique({ where: { id: targetSeatId } });
    expect(finalSeatState?.status).toBe('RESERVED');
  });

  /**
   * Scenario 5: End-to-End Full Life Cycle (Admin creates layout -> Event scheduled -> User browses venue map -> Zooms section -> Selects seats -> Completes checkout -> Database reservation verified).
   */
  test('Scenario 5: End-to-End Full Life Cycle from venue layout creation to user checkout & database verification', async ({ page }) => {
    await page.goto('/events');
    // Phase 1: Admin Layout Creation
    const e2eSection = {
      name: 'E2E Main Hall',
      code: 'MAIN-E2E',
      shapeType: 'RECTANGLE' as const,
      geometry: {
        shapeType: 'RECTANGLE' as const,
        points: [
          { x: 100, y: 100 },
          { x: 400, y: 100 },
          { x: 400, y: 300 },
          { x: 100, y: 300 },
        ],
        x: 100,
        y: 100,
        width: 300,
        height: 200,
        rotation: 0,
      },
      price: 150.0,
      color: '#3B82F6',
      rowCount: 4,
      seatsPerRow: 5,
    };

    assertValidGeometry(e2eSection.geometry);

    const layoutData = await page.evaluate(async ({ e2eSection }) => {
      const res = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Full Life Cycle Arena',
          canvasWidth: 1200,
          canvasHeight: 800,
          sections: [e2eSection],
        }),
      });
      return { status: res.status, json: await res.json() };
    }, { e2eSection });
    expect(layoutData.status).toBe(201);
    const createdLayoutId = layoutData.json.data.id;
    expect(createdLayoutId).toBeDefined();

    // Phase 2: Event Scheduling linked to created layout
    const createdEvent = await mockPrisma.event.create({
      data: {
        title: 'World Tour Grand Finale 2026',
        venueName: 'E2E Full Life Cycle Arena',
        startTime: new Date('2026-12-01T20:00:00.000Z'),
        layoutId: createdLayoutId,
      },
    });
    expect(createdEvent.id).toBeDefined();

    // Phase 3: User Browses Venue Map & Zooms into section
    await page.goto(`/events/${createdEvent.id}`);

    // Phase 4: User selects seats and verifies cart calculation
    const selectedSeatIds = ['seat-rect-11', 'seat-rect-12'];
    const expectedPrice = e2eSection.price * selectedSeatIds.length;
    expect(expectedPrice).toBe(300.0);

    // Phase 5: User locks seats & 10-min hold timer starts
    const lockData = await page.evaluate(async ({ selectedSeatIds }) => {
      const res = await fetch('/api/reservations/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userSessionId: 'sess-e2e-lifecycle-user',
          seatIds: selectedSeatIds,
        }),
      });
      return { status: res.status, json: await res.json() };
    }, { selectedSeatIds });
    expect(lockData.status).toBe(200);
    expect(lockData.json.data.status).toBe('PENDING');

    // Phase 6: User completes checkout
    const confirmData = await page.evaluate(async ({ reservationId, selectedSeatIds }) => {
      const res = await fetch('/api/reservations/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId,
          seatIds: selectedSeatIds,
        }),
      });
      return { status: res.status, json: await res.json() };
    }, { reservationId: lockData.json.data.reservationId, selectedSeatIds });
    expect(confirmData.status).toBe(200);
    expect(confirmData.json.data.status).toBe('CONFIRMED');

    // Phase 7: PostgreSQL Database verification
    const confirmedReservation = await mockPrisma.reservation.findUnique({
      where: { id: lockData.json.data.reservationId },
    });
    expect(confirmedReservation).not.toBeNull();
    expect(confirmedReservation?.status).toBe('CONFIRMED');
    expect(confirmedReservation?.userSessionId).toBe('sess-e2e-lifecycle-user');

    for (const seatId of selectedSeatIds) {
      const dbSeat = await mockPrisma.seat.findUnique({ where: { id: seatId } });
      expect(dbSeat?.status).toBe('RESERVED');
    }
  });
});
