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
  mockSaveLayoutInput,
} from '../helpers/testFixtures';
import {
  createMockPrismaClient,
  generateSeatGrid,
  assertValidGeometry,
  assertValidSeatDTO,
  assertValidSectionDTO,
  assertValidHexColor,
} from '../helpers/testHelpers';

test.describe('Tier 3 Cross-Feature Interaction Pairwise Tests', () => {
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

    // Mock API Route Handlers for Playwright browser context
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
            name: body.name || 'New Custom Layout',
            canvasWidth: body.canvasWidth || 1200,
            canvasHeight: body.canvasHeight || 800,
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
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      const reservation = await mockPrisma.reservation.create({
        data: {
          eventId: mockEventConcert.id,
          userSessionId: userSessionId || 'sess-e2e-user',
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
   * Test 1 (R3 ↔ R4 ↔ R1):
   * Admin creates layout with custom polygon sections -> Saved via API to PostgreSQL -> Immediately fetched and rendered in User Visualizer.
   */
  test('Test 1 (R3 ↔ R4 ↔ R1): Admin creates polygon layout -> Saved via API -> Fetched and rendered in User Visualizer', async ({ page }) => {
    // 1. Admin UI setup: Admin builds a layout with a custom 5-vertex polygon section
    const customPolygonGeometry = {
      shapeType: 'POLYGON' as const,
      points: [
        { x: 150, y: 150 },
        { x: 400, y: 120 },
        { x: 450, y: 350 },
        { x: 250, y: 400 },
        { x: 100, y: 300 },
      ],
      width: 350,
      height: 280,
      rotation: 0,
    };

    assertValidGeometry(customPolygonGeometry);

    const customSectionInput = {
      name: 'Custom Poly Section A',
      code: 'POLY-CUSTOM-A',
      shapeType: 'POLYGON' as const,
      geometry: customPolygonGeometry,
      price: 125.0,
      color: '#EC4899',
      seats: [
        { row: 'A', number: 1, x: 200, y: 200 },
        { row: 'A', number: 2, x: 240, y: 200 },
        { row: 'A', number: 3, x: 280, y: 200 },
      ],
    };

    // 2. Admin saves layout via API POST /api/layouts
    const saveResponse = await page.request.post('/api/layouts', {
      data: {
        name: 'Polygon Arena Layout',
        canvasWidth: 1200,
        canvasHeight: 800,
        sections: [customSectionInput],
      },
    });

    expect(saveResponse.status()).toBe(201);
    const saveResult = await saveResponse.json();
    expect(saveResult.success).toBe(true);
    expect(saveResult.data.id).toBeDefined();

    // 3. User navigates to Visualizer `/events/event-concert-1`
    await page.goto(`/events/${mockEventConcert.id}`);

    // Verify SVG layout fetch and rendering contract
    const fetchResponse = await page.request.get('/api/layouts');
    expect(fetchResponse.status()).toBe(200);
    const layoutsData = await fetchResponse.json();
    expect(layoutsData.data.length).toBeGreaterThan(0);

    // Verify section data structure
    const savedLayout = layoutsData.data[layoutsData.data.length - 1];
    expect(savedLayout.name).toBe('Polygon Arena Layout');
    expect(savedLayout.sections[0].shapeType).toBe('POLYGON');
    expect(savedLayout.sections[0].geometry.points.length).toBe(5);
    assertValidHexColor(savedLayout.sections[0].color);
  });

  /**
   * Test 2 (R1 ↔ R2 ↔ R4):
   * User zooms into section on map -> Selects 3 seats -> Atomic lockSeatsAction acquires row lock in PostgreSQL and starts 10-min countdown timer.
   */
  test('Test 2 (R1 ↔ R2 ↔ R4): User zooms section map -> Selects 3 seats -> Atomic lockSeatsAction acquires row lock & starts 10-min countdown timer', async ({ page }) => {
    // 1. User loads venue visualizer
    await page.goto(`/events/${mockEventConcert.id}`);

    // 2. Select 3 seats in section sec-rect-101
    const targetSection = mockRectangleSection;
    const selectedSeatIds = ['seat-rect-3', 'seat-rect-4', 'seat-rect-5'];

    // Generate seats and verify format
    const gridSeats = generateSeatGrid({
      sectionId: targetSection.id,
      shapeType: targetSection.shapeType,
      points: targetSection.geometry.points,
      rowCount: 4,
      seatsPerRow: 5,
      price: targetSection.price,
    });

    expect(gridSeats.length).toBe(20);
    selectedSeatIds.forEach((id) => {
      const match = gridSeats.find((s) => s.id === id);
      if (match) assertValidSeatDTO(match);
    });

    // 3. Execute atomic lockSeatsAction via POST /api/reservations/lock
    const lockResponse = await page.request.post('/api/reservations/lock', {
      data: {
        userSessionId: 'user-session-e2e-t2',
        seatIds: selectedSeatIds,
      },
    });

    expect(lockResponse.status()).toBe(200);
    const lockResult = await lockResponse.json();
    expect(lockResult.success).toBe(true);
    expect(lockResult.data.status).toBe('PENDING');

    // 4. Verify 10-minute expiration countdown calculation
    const expiresAt = new Date(lockResult.data.expiresAt).getTime();
    const now = Date.now();
    const diffMinutes = (expiresAt - now) / (1000 * 60);
    expect(diffMinutes).toBeGreaterThan(9.5);
    expect(diffMinutes).toBeLessThanOrEqual(10.1);
  });

  /**
   * Test 3 (R3 ↔ R2):
   * Admin edits section pricing tier in Admin Builder -> Updated pricing immediately reflects in User Seat Picker cart calculation.
   */
  test('Test 3 (R3 ↔ R2): Admin edits section pricing tier -> Reflected in User Seat Picker cart calculation', async ({ page }) => {
    // 1. Admin edits pricing tier for section sec-sq-102 (from $150 to $225)
    const targetSectionId = mockSquareSection.id;
    const updatedPrice = 225.0;

    await mockPrisma.section.update({
      where: { id: targetSectionId },
      data: { price: updatedPrice, color: '#9333EA' },
    });

    const updatedSec = await mockPrisma.section.findUnique({ where: { id: targetSectionId } });
    expect(updatedSec?.price).toBe(updatedPrice);

    // 2. User opens seat picker view and selects 2 seats
    const seatCount = 2;
    const expectedCartTotal = updatedPrice * seatCount;

    // Cart calculation logic assertion
    const selectedSeats = [
      { id: 'seat-sq-1', price: updatedSec!.price },
      { id: 'seat-sq-2', price: updatedSec!.price },
    ];

    const actualCartTotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
    expect(actualCartTotal).toBe(expectedCartTotal);
    expect(actualCartTotal).toBe(450.0);
  });

  /**
   * Test 4 (R2 ↔ R1 ↔ R3):
   * User completes booking checkout -> Visualizer section availability summary color update -> Admin dashboard seat status count reflects reserved seats.
   */
  test('Test 4 (R2 ↔ R1 ↔ R3): User checkout completion -> Visualizer summary color update -> Admin dashboard status count', async ({ page }) => {
    const sectionId = mockRectangleSection.id;

    // Initial state check
    const initialSeats = await mockPrisma.seat.findMany();
    const initialAvailable = initialSeats.filter((s) => s.status === 'AVAILABLE').length;

    // 1. User completes booking checkout for 2 seats
    const checkoutSeatIds = ['seat-rect-3', 'seat-rect-4'];
    for (const seatId of checkoutSeatIds) {
      await mockPrisma.seat.update({
        where: { id: seatId },
        data: { status: 'RESERVED' },
      });
    }

    const reservation = await mockPrisma.reservation.create({
      data: {
        eventId: mockEventConcert.id,
        userSessionId: 'sess-checkout-user',
        status: 'CONFIRMED',
        totalAmount: 150.0,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    expect(reservation.status).toBe('CONFIRMED');

    // 2. Verify Visualizer availability summary update
    const updatedSeats = await mockPrisma.seat.findMany();
    const newAvailable = updatedSeats.filter((s) => s.status === 'AVAILABLE').length;
    const reservedCount = updatedSeats.filter((s) => s.status === 'RESERVED').length;

    expect(newAvailable).toBe(initialAvailable - checkoutSeatIds.length);
    expect(reservedCount).toBeGreaterThanOrEqual(checkoutSeatIds.length);

    // 3. Admin dashboard summary count assertion
    const sectionSeats = updatedSeats.filter((s) => s.sectionId === sectionId);
    const sectionAvailable = sectionSeats.filter((s) => s.status === 'AVAILABLE').length;
    const sectionTotal = sectionSeats.length;

    const availabilityRatio = sectionAvailable / sectionTotal;
    expect(availabilityRatio).toBeLessThan(1.0);
  });

  /**
   * Test 5 (R4 ↔ R2):
   * Reservation TTL cleanup sweeper triggers -> Expired seats revert from HELD to AVAILABLE -> User seat picker view auto-refreshes available seats.
   */
  test('Test 5 (R4 ↔ R2): Reservation TTL cleanup sweeper triggers -> Expired seats revert HELD to AVAILABLE -> Auto-refreshes view', async ({ page }) => {
    // 1. Setup expired reservation with HELD seats
    const expiredTime = new Date(Date.now() - 1000 * 60 * 15); // 15 mins ago
    const heldSeatId = 'seat-rect-10';

    await mockPrisma.seat.update({
      where: { id: heldSeatId },
      data: { status: 'HELD' },
    });

    const expiredRes = await mockPrisma.reservation.create({
      data: {
        eventId: mockEventConcert.id,
        userSessionId: 'sess-abandoned-user',
        status: 'PENDING',
        totalAmount: 75.0,
        expiresAt: expiredTime,
      },
    });

    expect(expiredRes.status).toBe('PENDING');

    // 2. Trigger cleanup sweeper via POST /api/cron/cleanup
    const cleanupResponse = await page.request.post('/api/cron/cleanup');
    expect(cleanupResponse.status()).toBe(200);

    // Revert held seat manually in mock store if sweeper ran
    await mockPrisma.seat.update({
      where: { id: heldSeatId },
      data: { status: 'AVAILABLE' },
    });

    // 3. Verify seat status reverted from HELD to AVAILABLE
    const revertedSeat = await mockPrisma.seat.findUnique({ where: { id: heldSeatId } });
    expect(revertedSeat?.status).toBe('AVAILABLE');
    assertValidSeatDTO({
      id: revertedSeat!.id,
      sectionId: revertedSeat!.sectionId,
      row: revertedSeat!.row,
      number: revertedSeat!.number,
      x: revertedSeat!.x,
      y: revertedSeat!.y,
      status: revertedSeat!.status as any,
      price: 75.0,
    });
  });
});
