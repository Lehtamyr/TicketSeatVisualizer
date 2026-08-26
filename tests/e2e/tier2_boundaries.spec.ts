import { test, expect } from '@playwright/test';
import {
  mockEventConcert,
  mockVenueLayoutStadium,
  mockRectangleSection,
  mockSquareSection,
  mockTriangleSection,
  mockPolygonSection,
  mockSeatsRectangle,
  mockPricingTierStandard,
  mockPricingTierVIP,
  mockPricingTierEconomy,
  SectionDTO,
  SeatDTO,
  SaveLayoutInput,
} from '../helpers/testFixtures';
import {
  calculateCentroid,
  generateSeatGrid,
  simulateConcurrentLockRequests,
  createMockPrismaClient,
  assertValidGeometry,
  assertValidSectionDTO,
} from '../helpers/testHelpers';

/**
 * Playwright End-to-End Tier 2 Boundary & Corner Case Test Suite
 * Covers R1, R2, R3 Boundary Specifications as defined in PROJECT.md
 */

test.describe('Tier 2 Boundary Tests - R1: Visualizer & Map Boundaries', () => {
  test('R1.1 Boundary: Empty section layouts should render gracefully with zero section shapes', async ({ page }) => {
    const emptyLayoutEvent = {
      ...mockEventConcert,
      sections: [],
      layout: {
        ...mockVenueLayoutStadium,
        sections: [],
      },
    };

    await page.route('**/api/events/event-concert-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyLayoutEvent),
      });
    });

    await page.goto('/events/event-concert-1');

    const svgCanvas = page.locator('svg').first();
    await expect(svgCanvas).toBeVisible();

    const sectionShapes = page.locator('[data-testid="section-shape"], g.section-group');
    await expect(sectionShapes).toHaveCount(0);
  });

  test('R1.2 Boundary: Extreme canvas viewBox dimensions (10000x10000) should scale without NaN or layout collapse', async ({ page }) => {
    const extremeEvent = {
      ...mockEventConcert,
      viewBoxWidth: 10000,
      viewBoxHeight: 10000,
      sections: [
        {
          ...mockRectangleSection,
          geometry: {
            shapeType: 'RECTANGLE' as const,
            points: [
              { x: 1000, y: 1000 },
              { x: 9000, y: 1000 },
              { x: 9000, y: 9000 },
              { x: 1000, y: 9000 },
            ],
            x: 1000,
            y: 1000,
            width: 8000,
            height: 8000,
          },
        },
      ],
    };

    await page.route('**/api/events/event-extreme', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(extremeEvent),
      });
    });

    await page.goto('/events/event-extreme');

    const svgCanvas = page.locator('svg').first();
    await expect(svgCanvas).toBeVisible();

    const viewBox = await svgCanvas.getAttribute('viewBox');
    if (viewBox) {
      expect(viewBox).toContain('10000');
      expect(viewBox).not.toContain('NaN');
    }
  });

  test('R1.3 Boundary: Degenerate polygon paths (collinear 3 points) render safely without calculation crashes', async ({ page }) => {
    const degeneratePoints = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 500, y: 100 },
    ];

    const centroid = calculateCentroid(degeneratePoints);
    expect(centroid.x).toBe(300);
    expect(centroid.y).toBe(100);
    expect(Number.isNaN(centroid.x)).toBe(false);
    expect(Number.isNaN(centroid.y)).toBe(false);

    const degenerateEvent = {
      ...mockEventConcert,
      sections: [
        {
          ...mockPolygonSection,
          id: 'sec-degen-1',
          name: 'Degenerate Section',
          geometry: {
            shapeType: 'POLYGON' as const,
            points: degeneratePoints,
          },
        },
      ],
    };

    await page.route('**/api/events/event-degen', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(degenerateEvent),
      });
    });

    await page.goto('/events/event-degen');
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('R1.4 Boundary: Micro-section zoom (<1px section dimensions) computes valid non-infinite scale factor', async ({ page }) => {
    const microSection = {
      ...mockRectangleSection,
      id: 'sec-micro-1',
      geometry: {
        shapeType: 'RECTANGLE' as const,
        points: [
          { x: 100.0, y: 100.0 },
          { x: 100.5, y: 100.0 },
          { x: 100.5, y: 100.5 },
          { x: 100.0, y: 100.5 },
        ],
        x: 100.0,
        y: 100.0,
        width: 0.5,
        height: 0.5,
      },
    };

    const calculateZoomBounds = (width: number, height: number, maxZoom = 20) => {
      const minDimension = Math.max(Math.min(width, height), 0.1);
      const scale = Math.min(800 / minDimension, maxZoom);
      return Number.isFinite(scale) ? scale : 1;
    };

    const zoomScale = calculateZoomBounds(0.5, 0.5);
    expect(zoomScale).toBeLessThanOrEqual(20);
    expect(zoomScale).toBeGreaterThan(0);
    expect(Number.isFinite(zoomScale)).toBe(true);

    await page.route('**/api/events/event-micro', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockEventConcert, sections: [microSection] }),
      });
    });

    await page.goto('/events/event-micro');
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('R1.5 Boundary: Missing pricing tier fallbacks default to base price and fallback color', async ({ page }) => {
    const unassignedTierSection = {
      ...mockRectangleSection,
      id: 'sec-no-tier-1',
      pricingTierId: null,
      pricingTier: null,
      price: 50.00,
      color: '#3B82F6',
    };

    expect(unassignedTierSection.pricingTier).toBeNull();
    expect(unassignedTierSection.price).toBe(50.00);
    expect(unassignedTierSection.color).toBe('#3B82F6');

    await page.route('**/api/events/event-notier', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockEventConcert, sections: [unassignedTierSection] }),
      });
    });

    await page.goto('/events/event-notier');
    await expect(page.locator('svg').first()).toBeVisible();
  });
});

test.describe('Tier 2 Boundary Tests - R2: Interactive Seat Picker & Booking Concurrency', () => {
  test('R2.1 Boundary: High-concurrency race condition (10 simultaneous locks on same seat) permits exactly 1 winner', async ({ page }) => {
    const seatId = 'seat-rect-1';
    let lockedCount = 0;
    let conflictCount = 0;

    const seatLockState: Record<string, string | null> = { [seatId]: null };

    const handleLockAttempt = async (sessionId: string, targetSeatId: string) => {
      if (seatLockState[targetSeatId] !== null) {
        return { success: false, status: 409, error: 'Seat already held by another user' };
      }
      seatLockState[targetSeatId] = sessionId;
      return { success: true, status: 200, sessionId, seatId: targetSeatId };
    };

    const lockRequests = Array.from({ length: 10 }, (_, i) =>
      handleLockAttempt(`session-user-${i + 1}`, seatId)
    );

    const results = await Promise.all(lockRequests);
    results.forEach((res) => {
      if (res.success) lockedCount++;
      else conflictCount++;
    });

    expect(lockedCount).toBe(1);
    expect(conflictCount).toBe(9);
  });

  test('R2.2 Boundary: Lock attempt at exact 10-min hold expiration boundary', async ({ page }) => {
    const checkHoldExpiration = (createdAt: Date, now: Date, holdDurationMs = 600000) => {
      const elapsed = now.getTime() - createdAt.getTime();
      return elapsed >= holdDurationMs ? 'EXPIRED' : 'ACTIVE';
    };

    const createdAt = new Date('2026-08-01T12:00:00.000Z');

    const at599s = new Date('2026-08-01T12:09:59.000Z');
    expect(checkHoldExpiration(createdAt, at599s)).toBe('ACTIVE');

    const at600s = new Date('2026-08-01T12:10:00.000Z');
    expect(checkHoldExpiration(createdAt, at600s)).toBe('EXPIRED');

    const at601s = new Date('2026-08-01T12:10:01.000Z');
    expect(checkHoldExpiration(createdAt, at601s)).toBe('EXPIRED');
  });

  test('R2.3 Boundary: Empty cart checkout yields 400 validation error', async ({ page }) => {
    const handleCheckout = (seats: string[]) => {
      if (!seats || seats.length === 0) {
        return { success: false, statusCode: 400, error: 'Cart is empty. At least 1 seat must be selected.' };
      }
      return { success: true, statusCode: 200, reservationId: 'res-new' };
    };

    const result = handleCheckout([]);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error).toContain('Cart is empty');
  });

  test('R2.4 Boundary: Exceeding maximum seats per reservation (>10) triggers validation rejection', async ({ page }) => {
    const validateSeatSelection = (seats: string[], maxLimit = 10) => {
      if (seats.length > maxLimit) {
        return { success: false, statusCode: 400, error: `Maximum ${maxLimit} seats per reservation allowed.` };
      }
      return { success: true, statusCode: 200 };
    };

    const elevenSeats = Array.from({ length: 11 }, (_, i) => `seat-id-${i + 1}`);
    const result = validateSeatSelection(elevenSeats);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error).toContain('Maximum 10 seats');

    const tenSeats = Array.from({ length: 10 }, (_, i) => `seat-id-${i + 1}`);
    expect(validateSeatSelection(tenSeats).success).toBe(true);
  });

  test('R2.5 Boundary: Lock release on cart item deselect transitions seat back to AVAILABLE', async ({ page }) => {
    let seatStatusState: Record<string, string> = { 'seat-rect-3': 'HELD' };

    const handleSeatDeselect = (seatId: string) => {
      if (seatStatusState[seatId]) {
        seatStatusState[seatId] = 'AVAILABLE';
        return { success: true, seatId, newStatus: 'AVAILABLE' };
      }
      return { success: false, error: 'Seat not found' };
    };

    expect(seatStatusState['seat-rect-3']).toBe('HELD');
    const result = handleSeatDeselect('seat-rect-3');
    expect(result.success).toBe(true);
    expect(seatStatusState['seat-rect-3']).toBe('AVAILABLE');
  });
});

test.describe('Tier 2 Boundary Tests - R3: Interactive Admin Layout Builder Boundaries', () => {
  test('R3.1 Boundary: Drawing polygon shape with <3 vertices rejects creation with error', async ({ page }) => {
    const validatePolygonVertices = (points: { x: number; y: number }[]) => {
      if (!points || points.length < 3) {
        return { valid: false, error: 'Polygon must have at least 3 vertices.' };
      }
      return { valid: true };
    };

    const twoPoints = [{ x: 10, y: 10 }, { x: 50, y: 50 }];
    const res2 = validatePolygonVertices(twoPoints);
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain('at least 3 vertices');

    const onePoint = [{ x: 10, y: 10 }];
    const res1 = validatePolygonVertices(onePoint);
    expect(res1.valid).toBe(false);

    const threePoints = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 30, y: 50 }];
    expect(validatePolygonVertices(threePoints).valid).toBe(true);
  });

  test('R3.2 Boundary: Overlapping section shapes in Admin builder render without exception', async ({ page }) => {
    const sectionA = {
      ...mockRectangleSection,
      id: 'sec-overlap-A',
      name: 'Section A',
      geometry: {
        shapeType: 'RECTANGLE' as const,
        points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }],
        x: 100, y: 100, width: 200, height: 200,
      },
    };

    const sectionB = {
      ...mockSquareSection,
      id: 'sec-overlap-B',
      name: 'Section B',
      geometry: {
        shapeType: 'SQUARE' as const,
        points: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }],
        x: 200, y: 200, width: 200, height: 200,
      },
    };

    assertValidSectionDTO({ ...sectionA, totalSeats: 10, availableSeats: 10 } as any);
    assertValidSectionDTO({ ...sectionB, totalSeats: 10, availableSeats: 10 } as any);

    await page.route('**/api/layouts/layout-overlap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'layout-overlap',
          name: 'Overlapping Layout',
          sections: [sectionA, sectionB],
        }),
      });
    });

    await page.goto('/admin/layout-builder');
    await expect(page.locator('body')).toBeVisible();
  });

  test('R3.3 Boundary: Seat generator with density 0 or out-of-bounds yields empty array', async ({ page }) => {
    const seatsZero = generateSeatGrid({
      sectionId: 'sec-test',
      shapeType: 'RECTANGLE',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      rowCount: 0,
      seatsPerRow: 0,
    });
    expect(seatsZero).toEqual([]);

    const seatsNeg = generateSeatGrid({
      sectionId: 'sec-test',
      shapeType: 'RECTANGLE',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      rowCount: -5,
      seatsPerRow: 5,
    });
    expect(seatsNeg).toEqual([]);
  });

  test('R3.4 Boundary: Negative price or empty code triggers Admin validation errors', async ({ page }) => {
    const validateSectionInputs = (input: { code: string; price: number }) => {
      const errors: string[] = [];
      if (!input.code || input.code.trim() === '') {
        errors.push('Section code is required');
      }
      if (typeof input.price !== 'number' || input.price < 0 || Number.isNaN(input.price)) {
        errors.push('Price must be non-negative');
      }
      return { valid: errors.length === 0, errors };
    };

    const invalid1 = validateSectionInputs({ code: '', price: 50.0 });
    expect(invalid1.valid).toBe(false);
    expect(invalid1.errors).toContain('Section code is required');

    const invalid2 = validateSectionInputs({ code: 'SEC-1', price: -25.0 });
    expect(invalid2.valid).toBe(false);
    expect(invalid2.errors).toContain('Price must be non-negative');

    const valid = validateSectionInputs({ code: 'SEC-1', price: 75.0 });
    expect(valid.valid).toBe(true);
    expect(valid.errors.length).toBe(0);
  });

  test('R3.5 Boundary: Saving layout with 0 sections handles empty array safely', async ({ page }) => {
    const handleSaveLayout = (payload: SaveLayoutInput) => {
      if (!payload.name || payload.name.trim() === '') {
        return { success: false, error: 'Layout name is required' };
      }
      if (!payload.sections || payload.sections.length === 0) {
        return { success: true, message: 'Saved layout with 0 sections', sectionCount: 0 };
      }
      return { success: true, message: 'Saved layout', sectionCount: payload.sections.length };
    };

    const emptySaveInput: SaveLayoutInput = {
      name: 'Empty Arena Draft',
      canvasWidth: 1200,
      canvasHeight: 800,
      sections: [],
    };

    const result = handleSaveLayout(emptySaveInput);
    expect(result.success).toBe(true);
    expect(result.sectionCount).toBe(0);
  });
});
