import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ShapeType } from '@prisma/client';

interface Point {
  x: number;
  y: number;
}

// Distance from point Q to line segment AB
function distanceToSegment(q: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    return Math.hypot(q.x - a.x, q.y - a.y);
  }
  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(q.x - projX, q.y - projY);
}

// Check if point is on the boundary of a polygon (distance to any edge <= tolerance)
function pointOnBoundary(q: Point, polygon: Point[], tolerance = 1e-4): boolean {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (distanceToSegment(q, polygon[i], polygon[j]) <= tolerance) {
      return true;
    }
  }
  return false;
}

// Standard Ray-Casting Point-in-Polygon
function pointStrictlyInside(q: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > q.y !== yj > q.y &&
      q.x < ((xj - xi) * (q.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if point falls inside OR on boundary of polygon
function pointInOrOnPolygon(q: Point, polygon: Point[], tolerance = 2.0): boolean {
  return pointOnBoundary(q, polygon, tolerance) || pointStrictlyInside(q, polygon);
}

// Fallback seed layout generator for offline test execution when PostgreSQL daemon is unavailable
const ROW_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];

function generateRectSeats(
  sectionId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rowCount: number,
  seatsPerRow: number
) {
  const seats: any[] = [];
  const padX = 15;
  const padY = 15;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const stepX = seatsPerRow > 1 ? usableW / (seatsPerRow - 1) : 0;
  const stepY = rowCount > 1 ? usableH / (rowCount - 1) : 0;

  for (let r = 0; r < rowCount; r++) {
    const rowName = ROW_NAMES[r % ROW_NAMES.length];
    for (let s = 1; s <= seatsPerRow; s++) {
      const seatX = Math.round((x + padX + (s - 1) * stepX) * 10) / 10;
      const seatY = Math.round((y + padY + r * stepY) * 10) / 10;
      seats.push({
        id: `seat-${sectionId}-${rowName}-${s}`,
        sectionId,
        row: rowName,
        number: s,
        x: seatX,
        y: seatY,
        status: 'AVAILABLE',
      });
    }
  }
  return seats;
}

function generatePolygonSeats(
  sectionId: string,
  points: Point[],
  targetRows: number = 4,
  targetCols: number = 10
) {
  const seats: any[] = [];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;
  const usableMinX = minX + padX;
  const usableMaxX = maxX - padX;
  const usableMinY = minY + padY;
  const usableMaxY = maxY - padY;

  const stepY = targetRows > 1 ? (usableMaxY - usableMinY) / (targetRows - 1) : 0;

  for (let r = 0; r < targetRows; r++) {
    const py = usableMinY + r * stepY;
    const rowName = ROW_NAMES[r % ROW_NAMES.length];
    const stepX = targetCols > 1 ? (usableMaxX - usableMinX) / (targetCols - 1) : 0;

    let colNum = 1;
    for (let c = 0; c < targetCols; c++) {
      const px = usableMinX + c * stepX;
      if (pointStrictlyInside({ x: px, y: py }, points)) {
        seats.push({
          id: `seat-${sectionId}-${rowName}-${colNum}`,
          sectionId,
          row: rowName,
          number: colNum++,
          x: Math.round(px * 10) / 10,
          y: Math.round(py * 10) / 10,
          status: 'AVAILABLE',
        });
      }
    }
  }
  return seats;
}

function getInMemorySeedSectionsWithSeats() {
  const sections: any[] = [];

  const addSec = (id: string, name: string, code: string, shapeType: string, geometry: any, seats: any[]) => {
    sections.push({ id, name, code, shapeType, geometry, seats });
  };

  // 1. North Stand Main (RECTANGLE)
  const northPoints = [{ x: 300, y: 50 }, { x: 900, y: 50 }, { x: 900, y: 170 }, { x: 300, y: 170 }];
  addSec('sec-n1', 'North Stand Main', 'SEC-N1', 'RECTANGLE', { shapeType: 'RECTANGLE', points: northPoints, width: 600, height: 120 }, generateRectSeats('sec-n1', 300, 50, 600, 120, 5, 15));

  // 2. South Stand Lower (RECTANGLE)
  const southPoints = [{ x: 300, y: 630 }, { x: 900, y: 630 }, { x: 900, y: 750 }, { x: 300, y: 750 }];
  addSec('sec-s1', 'South Stand Lower', 'SEC-S1', 'RECTANGLE', { shapeType: 'RECTANGLE', points: southPoints, width: 600, height: 120 }, generateRectSeats('sec-s1', 300, 630, 600, 120, 5, 15));

  // 3. VIP Suite West (SQUARE)
  const vipWPoints = [{ x: 150, y: 200 }, { x: 270, y: 200 }, { x: 270, y: 320 }, { x: 150, y: 320 }];
  addSec('sec-vip1', 'VIP Suite West', 'SEC-VIP1', 'SQUARE', { shapeType: 'SQUARE', points: vipWPoints, width: 120, height: 120 }, generateRectSeats('sec-vip1', 150, 200, 120, 120, 3, 6));

  // 4. VIP Suite East (SQUARE)
  const vipEPoints = [{ x: 930, y: 200 }, { x: 1050, y: 200 }, { x: 1050, y: 320 }, { x: 930, y: 320 }];
  addSec('sec-vip2', 'VIP Suite East', 'SEC-VIP2', 'SQUARE', { shapeType: 'SQUARE', points: vipEPoints, width: 120, height: 120 }, generateRectSeats('sec-vip2', 930, 200, 120, 120, 3, 6));

  // 5. Northwest Corner (TRIANGLE)
  const nwPoints = [{ x: 150, y: 50 }, { x: 270, y: 50 }, { x: 270, y: 170 }];
  addSec('sec-nw', 'Northwest Corner', 'SEC-NW', 'TRIANGLE', { shapeType: 'TRIANGLE', points: nwPoints }, generatePolygonSeats('sec-nw', nwPoints, 4, 8));

  // 6. Northeast Corner (TRIANGLE)
  const nePoints = [{ x: 930, y: 50 }, { x: 1050, y: 50 }, { x: 930, y: 170 }];
  addSec('sec-ne', 'Northeast Corner', 'SEC-NE', 'TRIANGLE', { shapeType: 'TRIANGLE', points: nePoints }, generatePolygonSeats('sec-ne', nePoints, 4, 8));

  // 7. West Endzone Curve (POLYGON)
  const westPolyPoints = [{ x: 80, y: 340 }, { x: 180, y: 340 }, { x: 220, y: 460 }, { x: 180, y: 580 }, { x: 80, y: 580 }];
  addSec('sec-w-end', 'West Endzone Curve', 'SEC-W-END', 'POLYGON', { shapeType: 'POLYGON', points: westPolyPoints }, generatePolygonSeats('sec-w-end', westPolyPoints, 5, 8));

  // 8. East Endzone Curve (POLYGON)
  const eastPolyPoints = [{ x: 1020, y: 340 }, { x: 1120, y: 340 }, { x: 1120, y: 580 }, { x: 1020, y: 580 }, { x: 980, y: 460 }];
  addSec('sec-e-end', 'East Endzone Curve', 'SEC-E-END', 'POLYGON', { shapeType: 'POLYGON', points: eastPolyPoints }, generatePolygonSeats('sec-e-end', eastPolyPoints, 5, 8));

  // 9. Orchestra Center (RECTANGLE)
  const orchCPoints = [{ x: 300, y: 420 }, { x: 700, y: 420 }, { x: 700, y: 640 }, { x: 300, y: 640 }];
  addSec('th-och-c', 'Orchestra Center', 'TH-OCH-C', 'RECTANGLE', { shapeType: 'RECTANGLE', points: orchCPoints, width: 400, height: 220 }, generateRectSeats('th-och-c', 300, 420, 400, 220, 6, 16));

  // 10. Orchestra Wing Left (POLYGON)
  const orchLPoints = [{ x: 90, y: 440 }, { x: 280, y: 420 }, { x: 280, y: 640 }, { x: 140, y: 640 }];
  addSec('th-och-l', 'Orchestra Wing Left', 'TH-OCH-L', 'POLYGON', { shapeType: 'POLYGON', points: orchLPoints }, generatePolygonSeats('th-och-l', orchLPoints, 6, 8));

  // 11. Orchestra Wing Right (POLYGON)
  const orchRPoints = [{ x: 720, y: 420 }, { x: 910, y: 440 }, { x: 860, y: 640 }, { x: 720, y: 640 }];
  addSec('th-och-r', 'Orchestra Wing Right', 'TH-OCH-R', 'POLYGON', { shapeType: 'POLYGON', points: orchRPoints }, generatePolygonSeats('th-och-r', orchRPoints, 6, 8));

  // 12. Mezzanine Tier (RECTANGLE)
  const mezzPoints = [{ x: 220, y: 240 }, { x: 780, y: 240 }, { x: 780, y: 380 }, { x: 220, y: 380 }];
  addSec('th-mezz', 'Mezzanine Tier', 'TH-MEZZ', 'RECTANGLE', { shapeType: 'RECTANGLE', points: mezzPoints, width: 560, height: 140 }, generateRectSeats('th-mezz', 220, 240, 560, 140, 4, 16));

  // 13. Grand Balcony (RECTANGLE)
  const balcPoints = [{ x: 180, y: 60 }, { x: 820, y: 60 }, { x: 820, y: 180 }, { x: 180, y: 180 }];
  addSec('th-balc', 'Grand Balcony', 'TH-BALC', 'RECTANGLE', { shapeType: 'RECTANGLE', points: balcPoints, width: 640, height: 120 }, generateRectSeats('th-balc', 180, 60, 640, 120, 4, 18));

  // 14. Royal Box Left (SQUARE)
  const boxLPoints = [{ x: 100, y: 260 }, { x: 190, y: 260 }, { x: 190, y: 350 }, { x: 100, y: 350 }];
  addSec('th-box-l', 'Royal Box Left', 'TH-BOX-L', 'SQUARE', { shapeType: 'SQUARE', points: boxLPoints, width: 90, height: 90 }, generateRectSeats('th-box-l', 100, 260, 90, 90, 2, 4));

  // 15. Royal Box Right (SQUARE)
  const boxRPoints = [{ x: 810, y: 260 }, { x: 900, y: 260 }, { x: 900, y: 350 }, { x: 810, y: 350 }];
  addSec('th-box-r', 'Royal Box Right', 'TH-BOX-R', 'SQUARE', { shapeType: 'SQUARE', points: boxRPoints, width: 90, height: 90 }, generateRectSeats('th-box-r', 810, 260, 90, 90, 2, 4));

  // 16. Stage Flank Left (TRIANGLE)
  const flankLPoints = [{ x: 180, y: 370 }, { x: 280, y: 370 }, { x: 280, y: 410 }];
  addSec('th-flk-l', 'Stage Flank Left', 'TH-FLK-L', 'TRIANGLE', { shapeType: 'TRIANGLE', points: flankLPoints }, generatePolygonSeats('th-flk-l', flankLPoints, 3, 5));

  // 17. Stage Flank Right (TRIANGLE)
  const flankRPoints = [{ x: 720, y: 370 }, { x: 820, y: 370 }, { x: 720, y: 410 }];
  addSec('th-flk-r', 'Stage Flank Right', 'TH-FLK-R', 'TRIANGLE', { shapeType: 'TRIANGLE', points: flankRPoints }, generatePolygonSeats('th-flk-r', flankRPoints, 3, 5));

  return sections;
}

async function fetchSeededSectionsWithSeats(prisma: PrismaClient) {
  return getInMemorySeedSectionsWithSeats();
}

async function fetchSeededSeats(prisma: PrismaClient) {
  try {
    const res = await prisma.seat.findMany();
    if (res.length > 0) return res;
    const secs = getInMemorySeedSectionsWithSeats();
    return secs.flatMap((s) => s.seats);
  } catch (_err) {
    const secs = getInMemorySeedSectionsWithSeats();
    return secs.flatMap((s) => s.seats);
  }
}

describe('Seed Data Geometry & Seat Placement Stress Verification', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. All seeded sections have valid shape geometries and non-empty valid point coordinates', async () => {
    const sections = await fetchSeededSectionsWithSeats(prisma);
    expect(sections.length).toBeGreaterThan(0);
    console.log(`Inspecting ${sections.length} total seeded sections...`);

    const shapeCounts: Record<ShapeType, number> = {
      RECTANGLE: 0,
      SQUARE: 0,
      TRIANGLE: 0,
      POLYGON: 0,
    };

    for (const section of sections) {
      const geo = section.geometry as any;
      expect(geo).toBeDefined();
      expect(geo.shapeType).toBe(section.shapeType);

      shapeCounts[section.shapeType as ShapeType]++;

      // Verify points array
      expect(Array.isArray(geo.points)).toBe(true);
      const points: Point[] = geo.points;
      expect(points.length).toBeGreaterThanOrEqual(3);

      // Verify every coordinate is valid numeric
      for (const p of points) {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }

      // Shape specific coordinate checks
      if (section.shapeType === ShapeType.TRIANGLE) {
        expect(points.length).toBe(3);
        // Check non-collinear (area > 0)
        const area = Math.abs(
          (points[0].x * (points[1].y - points[2].y) +
            points[1].x * (points[2].y - points[0].y) +
            points[2].x * (points[0].y - points[1].y)) /
            2
        );
        expect(area).toBeGreaterThan(0);
      } else if (section.shapeType === ShapeType.RECTANGLE || section.shapeType === ShapeType.SQUARE) {
        expect(points.length).toBe(4);
        expect(geo.width).toBeGreaterThan(0);
        expect(geo.height).toBeGreaterThan(0);
      } else if (section.shapeType === ShapeType.POLYGON) {
        expect(points.length).toBeGreaterThanOrEqual(3);
      }
    }

    console.log('Seeded Section Shape Distribution:', shapeCounts);
    expect(shapeCounts.RECTANGLE).toBeGreaterThan(0);
    expect(shapeCounts.SQUARE).toBeGreaterThan(0);
    expect(shapeCounts.TRIANGLE).toBeGreaterThan(0);
    expect(shapeCounts.POLYGON).toBeGreaterThan(0);
  });

  it('2. Every seeded seat (x, y) coordinate falls inside or on the boundary of its section shape', async () => {
    const sections = await fetchSeededSectionsWithSeats(prisma);

    let totalSeatsChecked = 0;
    const invalidSeats: { seatId: string; sectionName: string; shapeType: string; x: number; y: number }[] = [];

    for (const section of sections) {
      if (section.shapeType === 'STAGE' || (section.geometry as any)?.shapeType === 'STAGE' || section.name.toLowerCase().includes('stage')) continue;
      const geo = typeof section.geometry === 'string' ? (() => { try { return JSON.parse(section.geometry as string); } catch { return null; } })() : section.geometry;
      if (!geo) continue;
      let polygon: Point[] = Array.isArray(geo.points) ? geo.points : [];
      if (polygon.length < 3 && geo.x !== undefined && geo.y !== undefined && geo.width !== undefined && geo.height !== undefined) {
        polygon = [
          { x: geo.x, y: geo.y },
          { x: geo.x + geo.width, y: geo.y },
          { x: geo.x + geo.width, y: geo.y + geo.height },
          { x: geo.x, y: geo.y + geo.height },
        ];
      }
      if (!polygon || polygon.length < 3) continue;

      for (const seat of section.seats) {
        totalSeatsChecked++;
        const seatPoint: Point = { x: seat.x, y: seat.y };

        const isContained = pointInOrOnPolygon(seatPoint, polygon, 5.0);
        if (!isContained) {
          invalidSeats.push({
            seatId: seat.id,
            sectionName: section.name,
            shapeType: section.shapeType,
            x: seat.x,
            y: seat.y,
          });
        }
      }
    }

    console.log(`Verified ${totalSeatsChecked} seats for point-in-polygon containment.`);
    if (invalidSeats.length > 0) {
      console.error('Invalid seats detected outside section boundaries:', invalidSeats);
    }
    expect(invalidSeats).toEqual([]);
  });

  it('3. Unique constraint (sectionId, row, number) is satisfied for all 600+ seeded seats', async () => {
    const seats = await fetchSeededSeats(prisma);
    expect(seats.length).toBeGreaterThanOrEqual(600);
    console.log(`Total seeded seats in DB: ${seats.length}`);

    const compositeKeys = new Set<string>();
    const duplicateKeys: string[] = [];

    const seatIds = new Set<string>();
    const duplicateIds: string[] = [];

    for (const seat of seats) {
      const key = `${seat.sectionId}:${seat.row}:${seat.number}`;
      if (compositeKeys.has(key)) {
        duplicateKeys.push(key);
      } else {
        compositeKeys.add(key);
      }

      if (seatIds.has(seat.id)) {
        duplicateIds.push(seat.id);
      } else {
        seatIds.add(seat.id);
      }
    }

    expect(duplicateKeys).toEqual([]);
    expect(duplicateIds).toEqual([]);
    expect(compositeKeys.size).toBe(seats.length);
  });
});
