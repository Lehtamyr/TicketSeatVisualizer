import type {
  Point,
  ShapeType,
  SectionGeometry,
  SectionDTO,
  SeatDTO,
} from '@/types/venue';

/**
 * Helper utilities for test suites, database mocking, geometry math,
 * seat grid generation, concurrent lock simulation, and format assertions.
 */

// ---------------------------------------------------------------------------
// 1. MOCKING DB OPERATIONS
// ---------------------------------------------------------------------------

export interface MockPrismaModel<T = any> {
  findUnique: (args?: any) => Promise<T | null>;
  findFirst: (args?: any) => Promise<T | null>;
  findMany: (args?: any) => Promise<T[]>;
  create: (args?: any) => Promise<T>;
  update: (args?: any) => Promise<T>;
  delete: (args?: any) => Promise<T>;
  upsert: (args?: any) => Promise<T>;
  count?: (args?: any) => Promise<number>;
}

export interface MockPrismaClient {
  event: MockPrismaModel;
  venueLayout: MockPrismaModel;
  section: MockPrismaModel;
  seat: MockPrismaModel;
  reservation: MockPrismaModel;
  reservationSeat: MockPrismaModel;
  pricingTier: MockPrismaModel;
  $transaction: <R>(fn: (tx: MockPrismaClient) => Promise<R>) => Promise<R>;
}

export function createMockPrismaModel<T = any>(initialData: T[] = []): MockPrismaModel<T> {
  let store: T[] = [...initialData];

  return {
    findUnique: async (args?: any) => {
      const id = args?.where?.id;
      if (!id) return store[0] || null;
      return store.find((item: any) => item.id === id) || null;
    },
    findFirst: async (args?: any) => {
      return store[0] || null;
    },
    findMany: async (args?: any) => {
      return [...store];
    },
    create: async (args?: any) => {
      const newItem = { id: `mock-id-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, ...args?.data };
      store.push(newItem);
      return newItem;
    },
    update: async (args?: any) => {
      const id = args?.where?.id;
      const index = store.findIndex((item: any) => item.id === id);
      if (index !== -1) {
        store[index] = { ...store[index], ...args?.data };
        return store[index];
      }
      throw new Error(`Record with id ${id} not found`);
    },
    delete: async (args?: any) => {
      const id = args?.where?.id;
      const index = store.findIndex((item: any) => item.id === id);
      if (index !== -1) {
        const deleted = store[index];
        store.splice(index, 1);
        return deleted;
      }
      throw new Error(`Record with id ${id} not found`);
    },
    upsert: async (args?: any) => {
      const id = args?.where?.id?.id || args?.where?.id;
      const existing = store.find((item: any) => item.id === id);
      if (existing) {
        Object.assign(existing, args?.update);
        return existing;
      }
      const created = { id: id || `mock-id-${Date.now()}`, ...args?.create };
      store.push(created);
      return created;
    },
    count: async () => store.length,
  };
}

export function createMockPrismaClient(seedData: {
  events?: any[];
  layouts?: any[];
  sections?: any[];
  seats?: any[];
  reservations?: any[];
  pricingTiers?: any[];
} = {}): MockPrismaClient {
  const client: MockPrismaClient = {
    event: createMockPrismaModel(seedData.events || []),
    venueLayout: createMockPrismaModel(seedData.layouts || []),
    section: createMockPrismaModel(seedData.sections || []),
    seat: createMockPrismaModel(seedData.seats || []),
    reservation: createMockPrismaModel(seedData.reservations || []),
    reservationSeat: createMockPrismaModel([]),
    pricingTier: createMockPrismaModel(seedData.pricingTiers || []),
    $transaction: async <R>(fn: (tx: MockPrismaClient) => Promise<R>): Promise<R> => {
      return fn(client);
    },
  };
  return client;
}

export function mockDbQueryResult<T>(data: T): Promise<T> {
  return Promise.resolve(data);
}

// ---------------------------------------------------------------------------
// 2. GEOMETRIC CENTROID CALCULATION
// ---------------------------------------------------------------------------

/**
 * Calculates the geometric centroid (center of mass) of a 2D shape defined by points.
 * Uses polygon area centroid calculation for polygons (n >= 3), falling back
 * to arithmetic average for simple or degenerate shapes.
 */
export function calculateCentroid(points: Point[]): Point {
  if (!points || points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y };
  }
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  // Polygon area centroid calculation
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const crossProduct = p1.x * p2.y - p2.x * p1.y;
    area += crossProduct;
    cx += (p1.x + p2.x) * crossProduct;
    cy += (p1.y + p2.y) * crossProduct;
  }

  area = area / 2;

  if (Math.abs(area) < 1e-7) {
    // Degenerate polygon: fallback to arithmetic mean
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    return {
      x: Number((sumX / n).toFixed(4)),
      y: Number((sumY / n).toFixed(4)),
    };
  }

  cx = cx / (6 * area);
  cy = cy / (6 * area);

  return {
    x: Number(cx.toFixed(4)),
    y: Number(cy.toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// 3. SEAT GRID GENERATOR
// ---------------------------------------------------------------------------

export interface GenerateSeatGridConfig {
  sectionId: string;
  shapeType: ShapeType;
  points: Point[];
  rowCount: number;
  seatsPerRow: number;
  price?: number;
  padding?: number;
}

export function generateSeatGrid(config: GenerateSeatGridConfig): SeatDTO[] {
  const { sectionId, points, rowCount, seatsPerRow, price = 50.0 } = config;

  if (!points || points.length === 0 || rowCount <= 0 || seatsPerRow <= 0) {
    return [];
  }

  // Compute bounding box
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = config.padding ?? 20;
  const usableWidth = Math.max(maxX - minX - padding * 2, 10);
  const usableHeight = Math.max(maxY - minY - padding * 2, 10);

  const stepX = seatsPerRow > 1 ? usableWidth / (seatsPerRow - 1) : 0;
  const stepY = rowCount > 1 ? usableHeight / (rowCount - 1) : 0;

  const seats: SeatDTO[] = [];

  for (let r = 0; r < rowCount; r++) {
    const rowLabel = String.fromCharCode(65 + r); // A, B, C...
    const y = minY + padding + r * stepY;

    for (let s = 0; s < seatsPerRow; s++) {
      const seatNum = s + 1;
      const x = minX + padding + s * stepX;

      seats.push({
        id: `seat-${sectionId}-${rowLabel}-${seatNum}`,
        sectionId,
        row: rowLabel,
        number: seatNum,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        status: 'AVAILABLE',
        price,
      });
    }
  }

  return seats;
}

// ---------------------------------------------------------------------------
// 4. SIMULATING CONCURRENT LOCK REQUESTS
// ---------------------------------------------------------------------------

export interface ConcurrentLockRequest {
  userSessionId: string;
  seatIds: string[];
}

export async function simulateConcurrentLockRequests<T>(
  lockFn: (userSessionId: string, seatIds: string[]) => Promise<T>,
  requests: ConcurrentLockRequest[]
): Promise<PromiseSettledResult<T>[]> {
  const promises = requests.map((req) => lockFn(req.userSessionId, req.seatIds));
  return Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// 5. FORMAT ASSERTIONS
// ---------------------------------------------------------------------------

export function assertValidUUID(id: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!id || typeof id !== 'string' || !uuidRegex.test(id)) {
    throw new Error(`Assertion Failed: String "${id}" is not a valid UUID v4`);
  }
}

export function assertValidHexColor(color: string): void {
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!color || typeof color !== 'string' || !hexColorRegex.test(color)) {
    throw new Error(`Assertion Failed: String "${color}" is not a valid hex color code`);
  }
}

export function assertValidISO8601(dateStr: string): void {
  const date = new Date(dateStr);
  if (isNaN(date.getTime()) || !dateStr.includes('T')) {
    throw new Error(`Assertion Failed: String "${dateStr}" is not a valid ISO 8601 date string`);
  }
}

export function assertValidGeometry(geometry: SectionGeometry): void {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error(`Assertion Failed: Invalid geometry object`);
  }
  const validShapes: ShapeType[] = ['RECTANGLE', 'SQUARE', 'TRIANGLE', 'POLYGON'];
  if (!validShapes.includes(geometry.shapeType)) {
    throw new Error(`Assertion Failed: Invalid shapeType "${geometry.shapeType}"`);
  }
  if (!Array.isArray(geometry.points) || geometry.points.length < 3) {
    throw new Error(`Assertion Failed: Geometry points must be an array of at least 3 points`);
  }
  for (const pt of geometry.points) {
    if (typeof pt.x !== 'number' || typeof pt.y !== 'number' || isNaN(pt.x) || isNaN(pt.y)) {
      throw new Error(`Assertion Failed: Point coordinates must be valid numbers, got ${JSON.stringify(pt)}`);
    }
  }
}

export function assertValidSeatDTO(seat: SeatDTO): void {
  if (!seat || typeof seat !== 'object') {
    throw new Error(`Assertion Failed: SeatDTO must be an object`);
  }
  if (typeof seat.id !== 'string' || !seat.id) {
    throw new Error(`Assertion Failed: SeatDTO.id must be a non-empty string`);
  }
  if (typeof seat.sectionId !== 'string' || !seat.sectionId) {
    throw new Error(`Assertion Failed: SeatDTO.sectionId must be a non-empty string`);
  }
  if (typeof seat.row !== 'string' || !seat.row) {
    throw new Error(`Assertion Failed: SeatDTO.row must be a non-empty string`);
  }
  if (typeof seat.number !== 'number' || seat.number <= 0) {
    throw new Error(`Assertion Failed: SeatDTO.number must be a positive integer`);
  }
  if (typeof seat.x !== 'number' || typeof seat.y !== 'number') {
    throw new Error(`Assertion Failed: SeatDTO coordinates x and y must be numbers`);
  }
  const validStatuses = ['AVAILABLE', 'HELD', 'RESERVED', 'BLOCKED'];
  if (!validStatuses.includes(seat.status)) {
    throw new Error(`Assertion Failed: SeatDTO.status "${seat.status}" is invalid`);
  }
  if (typeof seat.price !== 'number' || seat.price < 0) {
    throw new Error(`Assertion Failed: SeatDTO.price must be a non-negative number`);
  }
}

export function assertValidSectionDTO(section: SectionDTO): void {
  if (!section || typeof section !== 'object') {
    throw new Error(`Assertion Failed: SectionDTO must be an object`);
  }
  if (typeof section.id !== 'string' || !section.id) {
    throw new Error(`Assertion Failed: SectionDTO.id must be a non-empty string`);
  }
  if (typeof section.name !== 'string' || !section.name) {
    throw new Error(`Assertion Failed: SectionDTO.name must be a non-empty string`);
  }
  if (typeof section.code !== 'string' || !section.code) {
    throw new Error(`Assertion Failed: SectionDTO.code must be a non-empty string`);
  }
  assertValidGeometry(section.geometry);
  assertValidHexColor(section.color);
  if (typeof section.price !== 'number' || section.price < 0) {
    throw new Error(`Assertion Failed: SectionDTO.price must be a non-negative number`);
  }
  if (typeof section.totalSeats !== 'number' || section.totalSeats < 0) {
    throw new Error(`Assertion Failed: SectionDTO.totalSeats must be non-negative`);
  }
  if (typeof section.availableSeats !== 'number' || section.availableSeats < 0) {
    throw new Error(`Assertion Failed: SectionDTO.availableSeats must be non-negative`);
  }
}
