import { describe, it, expect } from 'vitest';
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
  mockVenueLayoutTheater,
  mockEventConcert,
  mockReservationPending,
  mockReservationConfirmed,
  mockSectionDTO,
  mockSeatDTO,
  mockSaveLayoutInput,
} from '../helpers/testFixtures';
import {
  calculateCentroid,
  generateSeatGrid,
  simulateConcurrentLockRequests,
  createMockPrismaClient,
  assertValidHexColor,
  assertValidGeometry,
  assertValidSeatDTO,
  assertValidSectionDTO,
  assertValidISO8601,
} from '../helpers/testHelpers';

describe('Test Infrastructure & Fixture Integrity', () => {
  it('should export valid pricing tier fixtures', () => {
    expect(mockPricingTierVIP.basePrice).toBe(150.0);
    assertValidHexColor(mockPricingTierVIP.color);

    expect(mockPricingTierStandard.basePrice).toBe(75.0);
    assertValidHexColor(mockPricingTierStandard.color);

    expect(mockPricingTierEconomy.basePrice).toBe(40.0);
    assertValidHexColor(mockPricingTierEconomy.color);
  });

  it('should export valid section fixtures for all 4 shape types', () => {
    // RECTANGLE
    expect(mockRectangleSection.shapeType).toBe('RECTANGLE');
    assertValidGeometry(mockRectangleSection.geometry);
    assertValidHexColor(mockRectangleSection.color);

    // SQUARE
    expect(mockSquareSection.shapeType).toBe('SQUARE');
    assertValidGeometry(mockSquareSection.geometry);
    assertValidHexColor(mockSquareSection.color);

    // TRIANGLE
    expect(mockTriangleSection.shapeType).toBe('TRIANGLE');
    assertValidGeometry(mockTriangleSection.geometry);
    assertValidHexColor(mockTriangleSection.color);

    // POLYGON
    expect(mockPolygonSection.shapeType).toBe('POLYGON');
    assertValidGeometry(mockPolygonSection.geometry);
    assertValidHexColor(mockPolygonSection.color);
  });

  it('should export valid seat fixtures', () => {
    expect(mockSeatsRectangle.length).toBe(20);
    expect(mockSeatsSquare.length).toBe(16);
    expect(mockSeatsTriangle.length).toBe(12);
    expect(mockSeatsPolygon.length).toBe(15);

    expect(mockSeatsRectangle[0].status).toBe('RESERVED');
    expect(mockSeatsRectangle[1].status).toBe('HELD');
    expect(mockSeatsRectangle[2].status).toBe('AVAILABLE');
  });

  it('should export valid venue layout & event fixtures', () => {
    expect(mockVenueLayoutStadium.sections.length).toBe(4);
    expect(mockVenueLayoutTheater.sections.length).toBe(2);

    expect(mockEventConcert.title).toContain('Summer Symphony');
    assertValidISO8601(mockEventConcert.startTime.toISOString());
  });

  it('should export valid DTO fixtures matching PROJECT.md interface contracts', () => {
    assertValidSectionDTO(mockSectionDTO);
    assertValidSeatDTO(mockSeatDTO);
    expect(mockSaveLayoutInput.sections.length).toBeGreaterThan(0);
  });
});

describe('Test Helpers Utility Functions', () => {
  it('should accurately calculate geometric centroid for RECTANGLE', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
    ];
    const centroid = calculateCentroid(points);
    expect(centroid.x).toBe(200);
    expect(centroid.y).toBe(150);
  });

  it('should accurately calculate geometric centroid for TRIANGLE', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ];
    const centroid = calculateCentroid(points);
    expect(centroid.x).toBe(2);
    expect(centroid.y).toBe(2);
  });

  it('should accurately calculate geometric centroid for POLYGON', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 15 },
      { x: 0, y: 10 },
    ];
    const centroid = calculateCentroid(points);
    expect(centroid.x).toBeGreaterThan(0);
    expect(centroid.y).toBeGreaterThan(0);
  });

  it('should generate seat grid within bounding box of shape', () => {
    const seats = generateSeatGrid({
      sectionId: 'sec-test',
      shapeType: 'RECTANGLE',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
        { x: 100, y: 200 },
      ],
      rowCount: 3,
      seatsPerRow: 4,
      price: 90,
    });

    expect(seats.length).toBe(12);
    for (const seat of seats) {
      assertValidSeatDTO(seat);
      expect(seat.price).toBe(90);
    }
  });

  it('should simulate concurrent lock requests properly', async () => {
    let callCount = 0;
    const mockLockFn = async (userSessionId: string, seatIds: string[]) => {
      callCount++;
      if (userSessionId === 'user-fail') {
        throw new Error('Seat locked by another user');
      }
      return { success: true, sessionId: userSessionId, seats: seatIds };
    };

    const requests = [
      { userSessionId: 'user-1', seatIds: ['seat-1', 'seat-2'] },
      { userSessionId: 'user-fail', seatIds: ['seat-1'] },
      { userSessionId: 'user-3', seatIds: ['seat-3'] },
    ];

    const results = await simulateConcurrentLockRequests(mockLockFn, requests);
    expect(results.length).toBe(3);
    expect(callCount).toBe(3);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('should create and operate mock Prisma Client', async () => {
    const mockPrisma = createMockPrismaClient({
      sections: [mockRectangleSection],
      events: [mockEventConcert],
    });

    const sections = await mockPrisma.section.findMany();
    expect(sections.length).toBe(1);
    expect(sections[0].id).toBe('sec-rect-101');

    const createdSection = await mockPrisma.section.create({
      data: { name: 'New Section', code: 'NEW', price: 50 },
    });
    expect(createdSection.name).toBe('New Section');

    const count = await mockPrisma.section.count!();
    expect(count).toBe(2);
  });
});
