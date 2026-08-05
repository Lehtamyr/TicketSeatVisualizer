import type {
  Point,
  ShapeType,
  SeatStatus,
  ReservationStatus,
  SectionGeometry,
  SectionDTO,
  SeatDTO,
  SaveLayoutInput,
} from '@/types/venue';

// Re-export DTO types for test consumption
export type {
  Point,
  ShapeType,
  SeatStatus,
  ReservationStatus,
  SectionGeometry,
  SectionDTO,
  SeatDTO,
  SaveLayoutInput,
};

// Interface definitions strictly matching Prisma models in PROJECT.md
export interface PrismaPricingTierFixture {
  id: string;
  name: string;
  color: string;
  basePrice: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PrismaSeatFixture {
  id: string;
  sectionId: string;
  row: string;
  number: number;
  x: number;
  y: number;
  status: SeatStatus;
  priceOverride: number | null;
  pricingTierId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaSectionFixture {
  id: string;
  layoutId: string | null;
  eventId: string | null;
  name: string;
  code: string;
  shapeType: ShapeType;
  geometry: SectionGeometry;
  pricingTierId: string | null;
  price: number;
  color: string;
  rowCount: number;
  seatsPerRow: number;
  createdAt: Date;
  updatedAt: Date;
  seats?: PrismaSeatFixture[];
  pricingTier?: PrismaPricingTierFixture | null;
}

export interface PrismaVenueLayoutFixture {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  createdAt: Date;
  updatedAt: Date;
  sections: PrismaSectionFixture[];
}

export interface PrismaReservationSeatFixture {
  id: string;
  reservationId: string;
  seatId: string;
  priceLocked: number;
  createdAt: Date;
  seat?: PrismaSeatFixture;
}

export interface PrismaReservationFixture {
  id: string;
  eventId: string;
  userSessionId: string;
  status: ReservationStatus;
  totalAmount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  seats: PrismaReservationSeatFixture[];
}

export interface PrismaEventFixture {
  id: string;
  title: string;
  description: string | null;
  venueName: string;
  startTime: Date;
  endTime: Date | null;
  viewBoxWidth: number;
  viewBoxHeight: number;
  layoutId: string | null;
  createdAt: Date;
  updatedAt: Date;
  layout?: PrismaVenueLayoutFixture | null;
  sections: PrismaSectionFixture[];
  reservations?: PrismaReservationFixture[];
}

const now = new Date('2026-08-01T00:00:00.000Z');
const expiresLater = new Date('2026-08-01T00:10:00.000Z');

// 1. PRICING TIERS FIXTURES
export const mockPricingTierVIP: PrismaPricingTierFixture = {
  id: 'tier-vip-001',
  name: 'VIP Tier',
  color: '#EF4444',
  basePrice: 150.00,
  createdAt: now,
  updatedAt: now,
};

export const mockPricingTierStandard: PrismaPricingTierFixture = {
  id: 'tier-std-002',
  name: 'Standard Tier',
  color: '#3B82F6',
  basePrice: 75.00,
  createdAt: now,
  updatedAt: now,
};

export const mockPricingTierEconomy: PrismaPricingTierFixture = {
  id: 'tier-eco-003',
  name: 'Economy Tier',
  color: '#10B981',
  basePrice: 40.00,
  createdAt: now,
  updatedAt: now,
};

export const mockPricingTiers = [
  mockPricingTierVIP,
  mockPricingTierStandard,
  mockPricingTierEconomy,
];

// 2. SEATS FIXTURES
export const mockSeatsRectangle: PrismaSeatFixture[] = Array.from({ length: 20 }, (_, i) => {
  const rowChar = String.fromCharCode(65 + Math.floor(i / 5)); // A, B, C, D
  const seatNum = (i % 5) + 1;
  return {
    id: `seat-rect-${i + 1}`,
    sectionId: 'sec-rect-101',
    row: rowChar,
    number: seatNum,
    x: 100 + (seatNum - 1) * 30,
    y: 100 + Math.floor(i / 5) * 30,
    status: i === 0 ? 'RESERVED' : i === 1 ? 'HELD' : i === 19 ? 'BLOCKED' : 'AVAILABLE',
    priceOverride: null,
    pricingTierId: 'tier-std-002',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
});

export const mockSeatsSquare: PrismaSeatFixture[] = Array.from({ length: 16 }, (_, i) => {
  const rowChar = String.fromCharCode(65 + Math.floor(i / 4));
  const seatNum = (i % 4) + 1;
  return {
    id: `seat-sq-${i + 1}`,
    sectionId: 'sec-sq-102',
    row: rowChar,
    number: seatNum,
    x: 450 + (seatNum - 1) * 30,
    y: 100 + Math.floor(i / 4) * 30,
    status: 'AVAILABLE',
    priceOverride: null,
    pricingTierId: 'tier-vip-001',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
});

export const mockSeatsTriangle: PrismaSeatFixture[] = Array.from({ length: 12 }, (_, i) => {
  const rowChar = String.fromCharCode(65 + Math.floor(i / 4));
  const seatNum = (i % 4) + 1;
  return {
    id: `seat-tri-${i + 1}`,
    sectionId: 'sec-tri-103',
    row: rowChar,
    number: seatNum,
    x: 650 + (seatNum - 1) * 25,
    y: 100 + Math.floor(i / 4) * 30,
    status: 'AVAILABLE',
    priceOverride: null,
    pricingTierId: 'tier-eco-003',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
});

export const mockSeatsPolygon: PrismaSeatFixture[] = Array.from({ length: 15 }, (_, i) => {
  const rowChar = String.fromCharCode(65 + Math.floor(i / 5));
  const seatNum = (i % 5) + 1;
  return {
    id: `seat-poly-${i + 1}`,
    sectionId: 'sec-poly-104',
    row: rowChar,
    number: seatNum,
    x: 820 + (seatNum - 1) * 25,
    y: 120 + Math.floor(i / 5) * 30,
    status: 'AVAILABLE',
    priceOverride: null,
    pricingTierId: 'tier-std-002',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
});

// 3. SECTIONS FIXTURES (covering RECTANGLE, SQUARE, TRIANGLE, POLYGON)
export const mockRectangleSection: PrismaSectionFixture = {
  id: 'sec-rect-101',
  layoutId: 'layout-stadium-1',
  eventId: 'event-concert-1',
  name: 'Main Orchestra Rect',
  code: 'ORCH-R',
  shapeType: 'RECTANGLE',
  geometry: {
    shapeType: 'RECTANGLE',
    points: [
      { x: 100, y: 100 },
      { x: 350, y: 100 },
      { x: 350, y: 250 },
      { x: 100, y: 250 },
    ],
    x: 100,
    y: 100,
    width: 250,
    height: 150,
    rotation: 0,
  },
  pricingTierId: 'tier-std-002',
  pricingTier: mockPricingTierStandard,
  price: 75.00,
  color: '#3B82F6',
  rowCount: 4,
  seatsPerRow: 5,
  createdAt: now,
  updatedAt: now,
  seats: mockSeatsRectangle,
};

export const mockSquareSection: PrismaSectionFixture = {
  id: 'sec-sq-102',
  layoutId: 'layout-stadium-1',
  eventId: 'event-concert-1',
  name: 'VIP Suite Square',
  code: 'VIP-SQ',
  shapeType: 'SQUARE',
  geometry: {
    shapeType: 'SQUARE',
    points: [
      { x: 400, y: 100 },
      { x: 580, y: 100 },
      { x: 580, y: 280 },
      { x: 400, y: 280 },
    ],
    x: 400,
    y: 100,
    width: 180,
    height: 180,
    rotation: 0,
  },
  pricingTierId: 'tier-vip-001',
  pricingTier: mockPricingTierVIP,
  price: 150.00,
  color: '#EF4444',
  rowCount: 4,
  seatsPerRow: 4,
  createdAt: now,
  updatedAt: now,
  seats: mockSeatsSquare,
};

export const mockTriangleSection: PrismaSectionFixture = {
  id: 'sec-tri-103',
  layoutId: 'layout-stadium-1',
  eventId: 'event-concert-1',
  name: 'Corner Wing Triangle',
  code: 'WING-TR',
  shapeType: 'TRIANGLE',
  geometry: {
    shapeType: 'TRIANGLE',
    points: [
      { x: 650, y: 100 },
      { x: 800, y: 280 },
      { x: 600, y: 280 },
    ],
    x: 600,
    y: 100,
    width: 200,
    height: 180,
    rotation: 0,
  },
  pricingTierId: 'tier-eco-003',
  pricingTier: mockPricingTierEconomy,
  price: 40.00,
  color: '#10B981',
  rowCount: 3,
  seatsPerRow: 4,
  createdAt: now,
  updatedAt: now,
  seats: mockSeatsTriangle,
};

export const mockPolygonSection: PrismaSectionFixture = {
  id: 'sec-poly-104',
  layoutId: 'layout-stadium-1',
  eventId: 'event-concert-1',
  name: 'Custom Curved Polygon',
  code: 'BALC-POLY',
  shapeType: 'POLYGON',
  geometry: {
    shapeType: 'POLYGON',
    points: [
      { x: 850, y: 100 },
      { x: 1050, y: 120 },
      { x: 1080, y: 300 },
      { x: 900, y: 320 },
      { x: 820, y: 220 },
    ],
    width: 260,
    height: 220,
    rotation: 0,
  },
  pricingTierId: 'tier-std-002',
  pricingTier: mockPricingTierStandard,
  price: 80.00,
  color: '#8B5CF6',
  rowCount: 3,
  seatsPerRow: 5,
  createdAt: now,
  updatedAt: now,
  seats: mockSeatsPolygon,
};

export const mockSections = [
  mockRectangleSection,
  mockSquareSection,
  mockTriangleSection,
  mockPolygonSection,
];

// 4. VENUE LAYOUTS FIXTURES
export const mockVenueLayoutStadium: PrismaVenueLayoutFixture = {
  id: 'layout-stadium-1',
  name: 'Metropolitan Stadium Main Layout',
  canvasWidth: 1200,
  canvasHeight: 800,
  createdAt: now,
  updatedAt: now,
  sections: mockSections,
};

export const mockVenueLayoutTheater: PrismaVenueLayoutFixture = {
  id: 'layout-theater-1',
  name: 'Grand Opera House Layout',
  canvasWidth: 1000,
  canvasHeight: 600,
  createdAt: now,
  updatedAt: now,
  sections: [mockRectangleSection, mockSquareSection],
};

export const mockVenueLayouts = [
  mockVenueLayoutStadium,
  mockVenueLayoutTheater,
];

// 5. RESERVATION FIXTURES
export const mockReservationPending: PrismaReservationFixture = {
  id: 'res-pending-001',
  eventId: 'event-concert-1',
  userSessionId: 'sess-user-123',
  status: 'PENDING',
  totalAmount: 150.00,
  expiresAt: expiresLater,
  createdAt: now,
  updatedAt: now,
  seats: [
    {
      id: 'res-seat-001',
      reservationId: 'res-pending-001',
      seatId: 'seat-rect-2',
      priceLocked: 75.00,
      createdAt: now,
      seat: mockSeatsRectangle[1],
    },
  ],
};

export const mockReservationConfirmed: PrismaReservationFixture = {
  id: 'res-confirmed-002',
  eventId: 'event-concert-1',
  userSessionId: 'sess-user-456',
  status: 'CONFIRMED',
  totalAmount: 75.00,
  expiresAt: expiresLater,
  createdAt: now,
  updatedAt: now,
  seats: [
    {
      id: 'res-seat-002',
      reservationId: 'res-confirmed-002',
      seatId: 'seat-rect-1',
      priceLocked: 75.00,
      createdAt: now,
      seat: mockSeatsRectangle[0],
    },
  ],
};

// 6. EVENTS FIXTURES
export const mockEventConcert: PrismaEventFixture = {
  id: 'event-concert-1',
  title: 'Summer Symphony Concert 2026',
  description: 'Live classical performance in the Grand Arena',
  venueName: 'Metropolitan Stadium',
  startTime: new Date('2026-09-15T19:00:00.000Z'),
  endTime: new Date('2026-09-15T22:00:00.000Z'),
  viewBoxWidth: 1200,
  viewBoxHeight: 800,
  layoutId: 'layout-stadium-1',
  createdAt: now,
  updatedAt: now,
  layout: mockVenueLayoutStadium,
  sections: mockSections,
  reservations: [mockReservationPending, mockReservationConfirmed],
};

export const mockEvents = [mockEventConcert];

// 7. DTO FIXTURES
export const mockSectionDTO: SectionDTO = {
  id: 'sec-rect-101',
  name: 'Main Orchestra Rect',
  code: 'ORCH-R',
  shapeType: 'RECTANGLE',
  geometry: {
    shapeType: 'RECTANGLE',
    points: [
      { x: 100, y: 100 },
      { x: 350, y: 100 },
      { x: 350, y: 250 },
      { x: 100, y: 250 },
    ],
    x: 100,
    y: 100,
    width: 250,
    height: 150,
    rotation: 0,
  },
  price: 75.00,
  color: '#3B82F6',
  tierName: 'Standard Tier',
  totalSeats: 20,
  availableSeats: 17,
};

export const mockSeatDTO: SeatDTO = {
  id: 'seat-rect-3',
  sectionId: 'sec-rect-101',
  row: 'A',
  number: 3,
  x: 160,
  y: 100,
  status: 'AVAILABLE',
  price: 75.00,
};

export const mockSaveLayoutInput: SaveLayoutInput = {
  layoutId: 'layout-stadium-1',
  name: 'Updated Metropolitan Stadium Layout',
  canvasWidth: 1200,
  canvasHeight: 800,
  sections: [
    {
      id: 'sec-rect-101',
      name: 'Main Orchestra Rect',
      code: 'ORCH-R',
      shapeType: 'RECTANGLE',
      geometry: {
        shapeType: 'RECTANGLE',
        points: [
          { x: 100, y: 100 },
          { x: 350, y: 100 },
          { x: 350, y: 250 },
          { x: 100, y: 250 },
        ],
        x: 100,
        y: 100,
        width: 250,
        height: 150,
        rotation: 0,
      },
      price: 75.00,
      color: '#3B82F6',
      seats: [
        { row: 'A', number: 1, x: 100, y: 100 },
        { row: 'A', number: 2, x: 130, y: 100 },
        { row: 'A', number: 3, x: 160, y: 100 },
      ],
    },
  ],
};
