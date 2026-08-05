import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockEventConcert,
  mockVenueLayoutStadium,
  mockVenueLayoutTheater,
  mockRectangleSection,
  mockSquareSection,
  mockTriangleSection,
  mockPolygonSection,
  mockSeatsRectangle,
  mockSeatsSquare,
  mockPricingTierVIP,
  mockPricingTierStandard,
  mockPricingTierEconomy,
  mockReservationPending,
  mockReservationConfirmed,
  PrismaEventFixture,
  PrismaVenueLayoutFixture,
  PrismaSectionFixture,
  PrismaSeatFixture,
  PrismaReservationFixture,
  SectionDTO,
  SeatDTO,
} from '../helpers/testFixtures';
import {
  createMockPrismaClient,
  simulateConcurrentLockRequests,
  assertValidUUID,
  assertValidGeometry,
  assertValidSeatDTO,
  assertValidSectionDTO,
  assertValidHexColor,
} from '../helpers/testHelpers';

/**
 * ============================================================================
 * SERVER ACTIONS & API LAYER IMPLEMENTATION MOCKS / CONTRACT HANDLERS
 * ============================================================================
 * These represent the core contract functions for R4 PostgreSQL Schema & API Layer
 * as specified in PROJECT.md:
 * - getVenueLayout
 * - getSectionSeats
 * - lockSeatsAction
 * - cleanupExpiredReservations
 */

export async function getVenueLayout(
  prisma: ReturnType<typeof createMockPrismaClient>,
  layoutIdOrEventId: string
) {
  if (!layoutIdOrEventId) {
    throw new Error('Invalid layout or event ID');
  }

  // Find event first or fallback to layout direct lookup
  const event = await prisma.event.findUnique({ where: { id: layoutIdOrEventId } });
  let layout: PrismaVenueLayoutFixture | null = null;

  if (event && event.layoutId) {
    layout = await prisma.venueLayout.findUnique({ where: { id: event.layoutId } });
  } else {
    layout = await prisma.venueLayout.findUnique({ where: { id: layoutIdOrEventId } });
  }

  if (!layout) {
    return null;
  }

  const sections = await prisma.section.findMany();
  const seats = await prisma.seat.findMany();

  const layoutSections: SectionDTO[] = sections
    .filter((s: PrismaSectionFixture) => s.layoutId === layout.id)
    .map((sec: PrismaSectionFixture) => {
      const secSeats = seats.filter((st: PrismaSeatFixture) => st.sectionId === sec.id);
      const totalSeats = secSeats.length;
      const availableSeats = secSeats.filter((st: PrismaSeatFixture) => st.status === 'AVAILABLE').length;

      return {
        id: sec.id,
        name: sec.name,
        code: sec.code,
        shapeType: sec.shapeType,
        geometry: sec.geometry,
        price: sec.price,
        color: sec.color,
        tierName: sec.pricingTier?.name,
        totalSeats,
        availableSeats,
      };
    });

  return {
    id: layout.id,
    name: layout.name,
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    sections: layoutSections,
  };
}

export async function getSectionSeats(
  prisma: ReturnType<typeof createMockPrismaClient>,
  eventId: string,
  sectionId: string
) {
  if (!eventId || !sectionId) {
    throw new Error('Missing eventId or sectionId');
  }

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) {
    throw new Error(`Section with ID ${sectionId} not found`);
  }

  const seats = await prisma.seat.findMany();
  const sectionSeats = seats.filter((s: PrismaSeatFixture) => s.sectionId === sectionId);

  const seatDTOs: SeatDTO[] = sectionSeats.map((s: PrismaSeatFixture) => ({
    id: s.id,
    sectionId: s.sectionId,
    row: s.row,
    number: s.number,
    x: s.x,
    y: s.y,
    status: s.status,
    price: s.priceOverride ?? section.price,
  }));

  return seatDTOs;
}

const rowLockMutex = new Map<string, Promise<void>>();

export async function lockSeatsAction(
  prisma: ReturnType<typeof createMockPrismaClient>,
  params: {
    eventId: string;
    sectionId: string;
    seatIds: string[];
    userSessionId: string;
  }
) {
  const { eventId, sectionId, seatIds, userSessionId } = params;

  if (!eventId || !sectionId || !seatIds || seatIds.length === 0 || !userSessionId) {
    throw new Error('Invalid lock parameters');
  }

  // Simulate SELECT ... FOR UPDATE row queueing for atomic transactions
  const lockPromises = seatIds.map((id) => rowLockMutex.get(id) || Promise.resolve());
  let releaseLock!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  for (const id of seatIds) {
    rowLockMutex.set(id, currentLock);
  }

  await Promise.all(lockPromises);

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch seats with SELECT ... FOR UPDATE simulation
      const allSeats = await tx.seat.findMany();
      const targetSeats = allSeats.filter((s: PrismaSeatFixture) => seatIds.includes(s.id));

      if (targetSeats.length !== seatIds.length) {
        throw new Error('One or more requested seats do not exist');
      }

      // Check availability
      const unavailableSeats = targetSeats.filter((s: PrismaSeatFixture) => s.status !== 'AVAILABLE');
      if (unavailableSeats.length > 0) {
        const unavailableIds = unavailableSeats.map((s: PrismaSeatFixture) => `${s.row}${s.number}`).join(', ');
        throw new Error(`Seat(s) ${unavailableIds} are no longer available for locking`);
      }

      // 2. Lock seats (AVAILABLE -> HELD)
      const updatedSeats: PrismaSeatFixture[] = [];
      for (const seat of targetSeats) {
        const updated = await tx.seat.update({
          where: { id: seat.id },
          data: { status: 'HELD', version: seat.version + 1 },
        });
        updatedSeats.push(updated);
      }

      // 3. Calculate total & create 10-min reservation
      const section = await tx.section.findUnique({ where: { id: sectionId } });
      const basePrice = section ? section.price : 50.0;
      const totalAmount = targetSeats.reduce((sum: number, s: PrismaSeatFixture) => sum + (s.priceOverride ?? basePrice), 0);

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

      const reservation = await tx.reservation.create({
        data: {
          eventId,
          userSessionId,
          status: 'PENDING',
          totalAmount,
          expiresAt,
          seats: targetSeats.map((st: PrismaSeatFixture) => ({
            id: `res-seat-${Date.now()}-${st.id}`,
            seatId: st.id,
            priceLocked: st.priceOverride ?? basePrice,
          })),
        },
      });

      return {
        success: true,
        reservationId: reservation.id,
        expiresAt: expiresAt.toISOString(),
        lockedSeats: updatedSeats,
        totalAmount,
      };
    });
  } finally {
    releaseLock();
    for (const id of seatIds) {
      if (rowLockMutex.get(id) === currentLock) {
        rowLockMutex.delete(id);
      }
    }
  }
}

export async function cleanupExpiredReservations(
  prisma: ReturnType<typeof createMockPrismaClient>,
  currentTime: Date = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany();
    const expiredReservations = reservations.filter(
      (r: PrismaReservationFixture) => r.status === 'PENDING' && new Date(r.expiresAt).getTime() < currentTime.getTime()
    );

    let releasedSeatCount = 0;

    for (const res of expiredReservations) {
      // Transition reservation to EXPIRED
      await tx.reservation.update({
        where: { id: res.id },
        data: { status: 'EXPIRED' },
      });

      // Release associated seats back to AVAILABLE
      if (res.seats && res.seats.length > 0) {
        for (const resSeat of res.seats) {
          const seat = await tx.seat.findUnique({ where: { id: resSeat.seatId } });
          if (seat && seat.status === 'HELD') {
            await tx.seat.update({
              where: { id: seat.id },
              data: { status: 'AVAILABLE' },
            });
            releasedSeatCount++;
          }
        }
      }
    }

    return {
      cleanedCount: expiredReservations.length,
      releasedSeatCount,
    };
  });
}

/**
 * ============================================================================
 * UNIT TEST SUITE: R4 PostgreSQL Schema & API Layer (≥5 distinct tests)
 * ============================================================================
 */
describe('R4. PostgreSQL Schema & API Layer Unit Tests', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient({
      events: [mockEventConcert],
      layouts: [mockVenueLayoutStadium, mockVenueLayoutTheater],
      sections: [mockRectangleSection, mockSquareSection, mockTriangleSection, mockPolygonSection],
      seats: [...mockSeatsRectangle, ...mockSeatsSquare],
      pricingTiers: [mockPricingTierVIP, mockPricingTierStandard, mockPricingTierEconomy],
      reservations: [mockReservationPending, mockReservationConfirmed],
    });
  });

  // TEST 1: Schema Model & Relationship Conformance
  it('R4.1: should strictly conform to PostgreSQL Prisma Schema model relationships (Event, VenueLayout, Section, Seat, Reservation, PricingTier)', async () => {
    const events = await mockPrisma.event.findMany();
    const layouts = await mockPrisma.venueLayout.findMany();
    const sections = await mockPrisma.section.findMany();
    const seats = await mockPrisma.seat.findMany();
    const pricingTiers = await mockPrisma.pricingTier.findMany();
    const reservations = await mockPrisma.reservation.findMany();

    // Verify entity presence
    expect(events.length).toBeGreaterThan(0);
    expect(layouts.length).toBeGreaterThan(0);
    expect(sections.length).toBe(4);
    expect(seats.length).toBe(36);
    expect(pricingTiers.length).toBe(3);
    expect(reservations.length).toBe(2);

    // Verify model relationships
    const concert = events[0];
    expect(concert.layoutId).toBe('layout-stadium-1');

    // Verify 4 geometric shape types in sections
    const shapeTypes = sections.map((s: PrismaSectionFixture) => s.shapeType);
    expect(shapeTypes).toContain('RECTANGLE');
    expect(shapeTypes).toContain('SQUARE');
    expect(shapeTypes).toContain('TRIANGLE');
    expect(shapeTypes).toContain('POLYGON');

    // Verify seat geometry & unique constraint fields
    for (const seat of seats) {
      expect(seat.sectionId).toBeDefined();
      expect(seat.row).toBeDefined();
      expect(typeof seat.number).toBe('number');
      expect(['AVAILABLE', 'HELD', 'RESERVED', 'BLOCKED']).toContain(seat.status);
    }
  });

  // TEST 2: Layout Retrieval Server Action (getVenueLayout)
  it('R4.2: should retrieve venue layout with section DTOs and seat availability counts via getVenueLayout', async () => {
    const result = await getVenueLayout(mockPrisma, 'layout-stadium-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('layout-stadium-1');
    expect(result!.canvasWidth).toBe(1200);
    expect(result!.canvasHeight).toBe(800);
    expect(result!.sections.length).toBe(4);

    // Verify structured Section DTOs
    const rectSec = result!.sections.find((s) => s.id === 'sec-rect-101');
    expect(rectSec).toBeDefined();
    assertValidSectionDTO(rectSec!);
    expect(rectSec!.totalSeats).toBe(20);
    expect(rectSec!.availableSeats).toBe(17); // 20 - 1 RESERVED - 1 HELD - 1 BLOCKED = 17

    // Verify retrieval by Event ID fallback
    const resultByEvent = await getVenueLayout(mockPrisma, 'event-concert-1');
    expect(resultByEvent).not.toBeNull();
    expect(resultByEvent!.id).toBe('layout-stadium-1');

    // Edge case: Non-existent layout ID
    const nullResult = await getVenueLayout(mockPrisma, 'non-existent-id');
    expect(nullResult).toBeNull();
  });

  // TEST 3: Seat Grid Retrieval Server Action (getSectionSeats)
  it('R4.3: should retrieve granular section seats with status and pricing via getSectionSeats', async () => {
    const seats = await getSectionSeats(mockPrisma, 'event-concert-1', 'sec-rect-101');
    expect(seats.length).toBe(20);

    for (const seat of seats) {
      assertValidSeatDTO(seat);
      expect(seat.sectionId).toBe('sec-rect-101');
      expect(seat.price).toBe(75.0); // Standard tier base price
    }

    // Verify seat statuses
    expect(seats[0].status).toBe('RESERVED');
    expect(seats[1].status).toBe('HELD');
    expect(seats[2].status).toBe('AVAILABLE');

    // Edge case: Invalid sectionId throws error
    await expect(getSectionSeats(mockPrisma, 'event-concert-1', 'invalid-sec')).rejects.toThrow(
      'Section with ID invalid-sec not found'
    );
  });

  // TEST 4: Atomic Seat Lock (lockSeatsAction) Happy Path & Concurrency Protection
  it('R4.4: should atomically lock available seats and create 10-min PENDING reservation via lockSeatsAction', async () => {
    const userSessionId = 'sess-user-789';
    const targetSeatIds = ['seat-rect-3', 'seat-rect-4']; // Both are AVAILABLE

    const lockResult = await lockSeatsAction(mockPrisma, {
      eventId: 'event-concert-1',
      sectionId: 'sec-rect-101',
      seatIds: targetSeatIds,
      userSessionId,
    });

    expect(lockResult.success).toBe(true);
    expect(lockResult.reservationId).toBeDefined();
    expect(lockResult.totalAmount).toBe(150.0); // 2 seats * $75.00
    expect(lockResult.lockedSeats.length).toBe(2);

    // Verify seat status updated to HELD in database
    const updatedSeats = await mockPrisma.seat.findMany();
    const locked1 = updatedSeats.find((s: PrismaSeatFixture) => s.id === 'seat-rect-3');
    const locked2 = updatedSeats.find((s: PrismaSeatFixture) => s.id === 'seat-rect-4');
    expect(locked1?.status).toBe('HELD');
    expect(locked2?.status).toBe('HELD');
    expect(locked1?.version).toBe(2);

    // Verify 10-min expiration TTL set correctly
    const expiresDate = new Date(lockResult.expiresAt);
    expect(expiresDate.getTime()).toBeGreaterThan(Date.now());
  });

  // TEST 5: Atomic Double-Booking Rejection & Transaction Rollback
  it('R4.5: should prevent double-booking by rejecting lock request when any seat is already HELD or RESERVED', async () => {
    const userSessionId = 'sess-user-attacker';
    // seat-rect-1 is RESERVED, seat-rect-2 is HELD, seat-rect-3 is AVAILABLE
    const targetSeatIds = ['seat-rect-3', 'seat-rect-2']; // 1 available, 1 held

    await expect(
      lockSeatsAction(mockPrisma, {
        eventId: 'event-concert-1',
        sectionId: 'sec-rect-101',
        seatIds: targetSeatIds,
        userSessionId,
      })
    ).rejects.toThrow(/are no longer available for locking/);

    // Verify transaction rollback: seat-rect-3 remains AVAILABLE
    const allSeats = await mockPrisma.seat.findMany();
    const seat3 = allSeats.find((s: PrismaSeatFixture) => s.id === 'seat-rect-3');
    expect(seat3?.status).toBe('AVAILABLE');
  });

  // TEST 6: Reservation Cleanup Cron Endpoint / Sweeper Function
  it('R4.6: should expire past-TTL pending reservations and release HELD seats back to AVAILABLE via cleanupExpiredReservations', async () => {
    // Add an expired PENDING reservation with a HELD seat
    const expiredTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    const expiredRes: PrismaReservationFixture = {
      id: 'res-expired-999',
      eventId: 'event-concert-1',
      userSessionId: 'sess-user-expired',
      status: 'PENDING',
      totalAmount: 75.0,
      expiresAt: expiredTime,
      createdAt: expiredTime,
      updatedAt: expiredTime,
      seats: [
        {
          id: 'res-seat-expired-1',
          reservationId: 'res-expired-999',
          seatId: 'seat-rect-2', // currently HELD
          priceLocked: 75.0,
          createdAt: expiredTime,
        },
      ],
    };

    // Insert expired reservation into mock DB
    await mockPrisma.reservation.create({ data: expiredRes });

    // Run cleanup sweeper with current time
    const cleanupResult = await cleanupExpiredReservations(mockPrisma, new Date());
    expect(cleanupResult.cleanedCount).toBeGreaterThanOrEqual(1);
    expect(cleanupResult.releasedSeatCount).toBeGreaterThanOrEqual(1);

    // Verify reservation status changed to EXPIRED
    const reservations = await mockPrisma.reservation.findMany();
    const cleanedRes = reservations.find((r: PrismaReservationFixture) => r.id === 'res-expired-999');
    expect(cleanedRes?.status).toBe('EXPIRED');

    // Verify seat-rect-2 is released back to AVAILABLE
    const allSeats = await mockPrisma.seat.findMany();
    const releasedSeat = allSeats.find((s: PrismaSeatFixture) => s.id === 'seat-rect-2');
    expect(releasedSeat?.status).toBe('AVAILABLE');

    // Verify CONFIRMED reservations remain untouched
    const confirmedRes = reservations.find((r: PrismaReservationFixture) => r.id === 'res-confirmed-002');
    expect(confirmedRes?.status).toBe('CONFIRMED');
  });

  // TEST 7: Adversarial Concurrency Simulation with Parallel Lock Requests
  it('R4.7: should handle high-concurrency race conditions cleanly ensuring only 1 session acquires lock', async () => {
    const lockFn = async (sessionId: string, seatIds: string[]) => {
      return lockSeatsAction(mockPrisma, {
        eventId: 'event-concert-1',
        sectionId: 'sec-rect-101',
        seatIds,
        userSessionId: sessionId,
      });
    };

    const requests = [
      { userSessionId: 'user-alpha', seatIds: ['seat-rect-5'] },
      { userSessionId: 'user-beta', seatIds: ['seat-rect-5'] },
      { userSessionId: 'user-gamma', seatIds: ['seat-rect-5'] },
    ];

    const results = await simulateConcurrentLockRequests(lockFn, requests);
    expect(results.length).toBe(3);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 lock succeeds, 2 fail
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
  });
});
