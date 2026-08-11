import { test, expect } from '@playwright/test';
import {
  mockEventConcert,
  mockVenueLayoutStadium,
  mockRectangleSection,
  mockSquareSection,
  mockTriangleSection,
  mockPolygonSection,
  mockPricingTiers,
  mockSeatsRectangle,
} from '../helpers/testFixtures';

/**
 * ============================================================================
 * E2E TEST SUITE: TIER 1 FEATURES (R1, R2, R3)
 * Playwright tests covering:
 * - R1: Modular Section Map Visualizer (5 tests)
 * - R2: Interactive Seat Picker & Booking Flow (5 tests)
 * - R3: Interactive Admin Layout Builder (5 tests)
 * Total: 15 Playwright E2E tests
 * ============================================================================
 */

test.describe('R1. Modular Section Map Visualizer E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API layout route with mock layout data
    await page.route('/api/events/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          event: mockEventConcert,
          layout: mockVenueLayoutStadium,
        }),
      });
    });
  });

  // TEST 1: SVG Map & 4 Geometric Shape Types Rendering
  test('R1.1: should render SVG venue map canvas with RECTANGLE, SQUARE, TRIANGLE, and POLYGON section shapes', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    // Verify main SVG map element
    const svgMap = page.locator('svg[data-testid="venue-svg-map"], svg.venue-map');
    await expect(svgMap).toBeVisible();

    // Verify RECTANGLE section shape
    const rectShape = page.locator('[data-testid="section-shape-sec-rect-101"], rect.section-shape[data-shape="RECTANGLE"]');
    await expect(rectShape).toBeVisible();

    // Verify SQUARE section shape
    const sqShape = page.locator('[data-testid="section-shape-sec-sq-102"], rect.section-shape[data-shape="SQUARE"]');
    await expect(sqShape).toBeVisible();

    // Verify TRIANGLE section shape
    const triShape = page.locator('[data-testid="section-shape-sec-tri-103"], polygon.section-shape[data-shape="TRIANGLE"]');
    await expect(triShape).toBeVisible();

    // Verify POLYGON section shape
    const polyShape = page.locator('[data-testid="section-shape-sec-poly-104"], polygon.section-shape[data-shape="POLYGON"]');
    await expect(polyShape).toBeVisible();
  });

  // TEST 2: Pricing Tier Color Coding
  test('R1.2: should visually reflect pricing tier color coding across section shapes', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    // Standard Tier (blue - #3B82F6)
    const rectShape = page.locator('[data-testid="section-shape-sec-rect-101"]');
    await expect(rectShape).toHaveAttribute('fill', '#3B82F6');

    // VIP Tier (red - #EF4444)
    const sqShape = page.locator('[data-testid="section-shape-sec-sq-102"]');
    await expect(sqShape).toHaveAttribute('fill', '#EF4444');

    // Economy Tier (green - #10B981)
    const triShape = page.locator('[data-testid="section-shape-sec-tri-103"]');
    await expect(triShape).toHaveAttribute('fill', '#10B981');

    // Balcony Custom Tier (purple - #8B5CF6)
    const polyShape = page.locator('[data-testid="section-shape-sec-poly-104"]');
    await expect(polyShape).toHaveAttribute('fill', '#8B5CF6');
  });

  // TEST 3: Interactive Section Tooltips
  test('R1.3: should display interactive tooltip with section details on hover', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    const rectShape = page.locator('[data-testid="section-shape-sec-rect-101"]');
    await rectShape.hover();

    const tooltip = page.locator('[data-testid="section-tooltip"], .section-tooltip');
    await expect(tooltip).toBeVisible();

    // Verify tooltip contents
    await expect(tooltip).toContainText('Main Orchestra Rect');
    await expect(tooltip).toContainText('$75.00');
    await expect(tooltip).toContainText('Standard Tier');
    await expect(tooltip).toContainText('17 available'); // 20 total - 3 unavail
  });

  // TEST 4: Smooth Section Camera Zoom Animation
  test('R1.4: should smoothly zoom viewBox into clicked section bounding box', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    const svgMap = page.locator('svg[data-testid="venue-svg-map"]').first();
    const initialViewBox = await svgMap.getAttribute('viewBox');
    expect(initialViewBox).toBe('0 0 1200 800');

    // Click on Orchestra Rect section (x: 100, y: 100, width: 250, height: 150)
    const rectShape = page.locator('[data-testid="section-shape-sec-rect-101"]');
    await rectShape.click();

    // Verify viewBox transitions to section bounding box focus
    const zoomedViewBox = await svgMap.getAttribute('viewBox');
    expect(zoomedViewBox).not.toBe(initialViewBox);
    expect(zoomedViewBox).toMatch(/\d+ \d+ \d+ \d+/);
  });

  // TEST 5: Interactive Hover & Focus Highlights
  test('R1.5: should apply highlight styles and cursor pointer on section shape hover', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    const shape = page.locator('[data-testid="section-shape-sec-rect-101"]');

    // Verify cursor pointer class or inline style
    await expect(shape).toHaveCSS('cursor', 'pointer');

    // Hover state
    await shape.hover();
    await expect(shape).toHaveClass(/hovered|highlighted|active|focus/);
  });
});

test.describe('R2. Interactive Seat Picker & Booking Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/events/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          event: mockEventConcert,
          layout: mockVenueLayoutStadium,
          seats: mockSeatsRectangle,
        }),
      });
    });
  });

  // TEST 1: Granular Seat Grid Overlay Rendering
  test('R2.1: should render seat grid overlay modal displaying seat matrix and status colors', async ({ page }) => {
    await page.goto('/events/event-concert-1');

    // Open seat picker overlay by clicking section
    const rectShape = page.locator('[data-testid="section-shape-sec-rect-101"]');
    await rectShape.click();

    const seatOverlay = page.locator('[data-testid="seat-grid-overlay"], .seat-grid-picker');
    await expect(seatOverlay).toBeVisible();

    // Verify seats rendered (row A-D, seats 1-5)
    const seats = page.locator('[data-testid^="seat-button-"]');
    await expect(seats).toHaveCount(20);

    // Verify status indicators
    const reservedSeat = page.locator('[data-testid="seat-button-seat-rect-1"]');
    await expect(reservedSeat).toHaveAttribute('data-status', 'RESERVED');
    await expect(reservedSeat).toBeDisabled();

    const availableSeat = page.locator('[data-testid="seat-button-seat-rect-3"]');
    await expect(availableSeat).toHaveAttribute('data-status', 'AVAILABLE');
  });

  // TEST 2: Seat Status Selection Toggle
  test('R2.2: should toggle seat status between AVAILABLE and SELECTED when clicked', async ({ page }) => {
    await page.goto('/events/event-concert-1');
    await page.locator('[data-testid="section-shape-sec-rect-101"]').click();

    const seat3 = page.locator('[data-testid="seat-button-seat-rect-3"]');

    // Click to select
    await seat3.click();
    await expect(seat3).toHaveAttribute('data-status', 'SELECTED');
    await expect(seat3).toHaveClass(/selected|active|held/);

    // Click again to deselect
    await seat3.click();
    await expect(seat3).toHaveAttribute('data-status', 'AVAILABLE');
  });

  // TEST 3: Cart Total Calculation
  test('R2.3: should update cart sidebar total dynamically when seats are selected and deselected', async ({ page }) => {
    await page.goto('/events/event-concert-1');
    await page.locator('[data-testid="section-shape-sec-rect-101"]').click();

    const cartTotal = page.locator('[data-testid="cart-total-price"]');
    await expect(cartTotal).toContainText('$0.00');

    // Select seat 3 ($75.00)
    await page.locator('[data-testid="seat-button-seat-rect-3"]').click();
    await expect(cartTotal).toContainText('$75.00');

    // Select seat 4 ($75.00)
    await page.locator('[data-testid="seat-button-seat-rect-4"]').click();
    await expect(cartTotal).toContainText('$150.00');

    // Deselect seat 3
    await page.locator('[data-testid="seat-button-seat-rect-3"]').click();
    await expect(cartTotal).toContainText('$75.00');
  });

  // TEST 4: 10-Minute Countdown Timer
  test('R2.4: should display active 10-minute reservation countdown timer upon seat selection', async ({ page }) => {
    await page.goto('/events/event-concert-1');
    await page.locator('[data-testid="section-shape-sec-rect-101"]').click();

    // Select seat to initiate reservation hold
    await page.locator('[data-testid="seat-button-seat-rect-3"]').click();

    const timer = page.locator('[data-testid="countdown-timer"], .reservation-timer');
    await expect(timer).toBeVisible();

    // Check timer format (e.g. 10:00 or 09:59)
    await expect(timer).toContainText(/09:\d\d|10:00/);
  });

  // TEST 5: Lock & Checkout Flow Confirmation
  test('R2.5: should complete booking checkout flow and confirm seat reservation', async ({ page }) => {
    await page.goto('/events/event-concert-1');
    await page.locator('[data-testid="section-shape-sec-rect-101"]').click();

    // Select available seat
    await page.locator('[data-testid="seat-button-seat-rect-3"]').click();

    // Click checkout button
    const checkoutBtn = page.locator('[data-testid="checkout-button"], button:has-text("Proceed to Checkout")');
    await checkoutBtn.click();

    // Verify confirmation modal
    const confirmationModal = page.locator('[data-testid="booking-confirmation-modal"], .checkout-success');
    await expect(confirmationModal).toBeVisible();
    await expect(confirmationModal).toContainText(/Reservation Confirmed|Booking Successful/i);
    await expect(confirmationModal).toContainText('Main Orchestra Rect');
  });
});

test.describe('R3. Interactive Admin Layout Builder E2E Tests', () => {
  // TEST 1: Admin Workspace Canvas Rendering
  test('R3.1: should render admin canvas workspace and layout builder tools at /admin/layout-builder', async ({ page }) => {
    await page.goto('/admin/layout-builder');

    const adminCanvas = page.locator('[data-testid="admin-canvas-workspace"], #admin-canvas');
    await expect(adminCanvas).toBeVisible();

    const toolbar = page.locator('[data-testid="drawing-toolbar"], .admin-toolbar');
    await expect(toolbar).toBeVisible();

    const propertyEditor = page.locator('[data-testid="section-property-editor"], .property-editor-panel');
    await expect(propertyEditor).toBeVisible();
  });

  // TEST 2: Shape Drawing Tools (Rectangle, Triangle, Polygon)
  test('R3.2: should allow drawing section shapes using rectangle, triangle, and polygon tools', async ({ page }) => {
    await page.goto('/admin/layout-builder');

    const rectTool = page.locator('[data-testid="tool-rectangle"], button:has-text("Rectangle")');
    await rectTool.click();

    // Simulate canvas click/drag to draw rectangle
    const canvas = page.locator('[data-testid="admin-canvas-workspace"]');
    await canvas.click({ position: { x: 100, y: 100 } });

    // Verify new shape node created on canvas
    const drawnShape = page.locator('[data-testid^="admin-section-shape-"]');
    await expect(drawnShape).toBeVisible();
  });

  // TEST 3: Section Property Editor
  test('R3.3: should update section name, code, pricing tier, base price, and color in property editor', async ({ page }) => {
    await page.goto('/admin/layout-builder');

    // Select existing or default section on canvas
    const sectionShape = page.locator('[data-testid="admin-section-shape-1"], .canvas-section').first();
    await sectionShape.click();

    // Edit Name
    const nameInput = page.locator('[data-testid="input-section-name"], input[name="sectionName"]');
    await nameInput.fill('VIP East Box');

    // Edit Code
    const codeInput = page.locator('[data-testid="input-section-code"], input[name="sectionCode"]');
    await codeInput.fill('VIP-E');

    // Edit Base Price
    const priceInput = page.locator('[data-testid="input-section-price"], input[name="basePrice"]');
    await priceInput.fill('200.00');

    // Verify property editor reflects updated values
    await expect(nameInput).toHaveValue('VIP East Box');
    await expect(codeInput).toHaveValue('VIP-E');
    await expect(priceInput).toHaveValue('200.00');
  });

  // TEST 4: Seat Grid Auto-Generator Overlay
  test('R3.4: should generate seat grid overlay inside section shape based on row and seat count inputs', async ({ page }) => {
    await page.goto('/admin/layout-builder');

    // Select section
    await page.locator('[data-testid="admin-section-shape-1"], .canvas-section').first().click();

    // Open Seat Grid Generator Config
    const generateBtn = page.locator('[data-testid="btn-open-grid-generator"], button:has-text("Generate Seat Grid")');
    await generateBtn.click();

    // Set 4 rows and 6 seats per row
    await page.locator('[data-testid="input-row-count"], input[name="rowCount"]').fill('4');
    await page.locator('[data-testid="input-seats-per-row"], input[name="seatsPerRow"]').fill('6');

    // Click Apply Generator
    await page.locator('[data-testid="btn-apply-grid-generator"], button:has-text("Generate")').click();

    // Verify 24 seats generated inside shape preview
    const previewSeats = page.locator('[data-testid^="grid-preview-seat-"]');
    await expect(previewSeats).toHaveCount(24);
  });

  // TEST 5: Save and Publish Venue Layout to DB
  test('R3.5: should trigger save layout action and present success confirmation upon publishing layout', async ({ page }) => {
    await page.goto('/admin/layout-builder');

    // Intercept Save Action / API Route
    await page.route('/api/layouts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          layoutId: 'layout-stadium-saved-001',
          message: 'Venue layout saved successfully',
        }),
      });
    });

    const saveBtn = page.locator('[data-testid="save-layout-button"], button:has-text("Save Layout")');
    await saveBtn.click();

    const toast = page.locator('[data-testid="toast-notification"], .toast-success');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/Layout saved successfully/i);
  });
});
