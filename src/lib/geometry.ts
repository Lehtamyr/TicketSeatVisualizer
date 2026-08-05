import { Point, ShapeType, SectionGeometry } from '@/types/venue';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Renders an SVG path string from SectionGeometry.
 * Supports RECTANGLE, SQUARE, TRIANGLE, and POLYGON shape types.
 */
export function renderShapePath(geometry: SectionGeometry): string {
  if (!geometry) return '';

  let pts: Point[] = geometry.points || [];

  if (pts.length < 3) {
    if (
      (geometry.shapeType === 'RECTANGLE' || geometry.shapeType === 'SQUARE') &&
      geometry.x !== undefined &&
      geometry.y !== undefined &&
      geometry.width !== undefined &&
      geometry.height !== undefined
    ) {
      pts = [
        { x: geometry.x, y: geometry.y },
        { x: geometry.x + geometry.width, y: geometry.y },
        { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
        { x: geometry.x, y: geometry.y + geometry.height },
      ];
    } else if (
      geometry.shapeType === 'CIRCLE' &&
      geometry.cx !== undefined &&
      geometry.cy !== undefined &&
      geometry.r !== undefined
    ) {
      pts = generateCirclePoints(geometry.cx, geometry.cy, geometry.r);
    } else {
      return '';
    }
  }

  const pathCommands = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return `${pathCommands} Z`;
}

/**
 * Calculates axis-aligned bounding box (AABB) for a point set.
 */
export function calculateBoundingBox(points: Point[]): BoundingBox {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculates area of polygon using the Shoelace formula.
 */
export function calculatePolygonArea(points: Point[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates geometric center of mass (centroid) of a polygon.
 */
export function calculateCentroid(points: Point[]): Point {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const factor = points[i].x * points[j].y - points[j].x * points[i].y;
    area += factor;
    cx += (points[i].x + points[j].x) * factor;
    cy += (points[i].y + points[j].y) * factor;
  }

  area /= 2;
  if (Math.abs(area) < 1e-6) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / n, y: sum.y / n };
  }

  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

/**
 * Calculates shortest distance from point Q to line segment AB.
 */
export function distanceToSegment(q: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(q.x - a.x, q.y - a.y);

  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(q.x - projX, q.y - projY);
}

/**
 * Checks if point q lies on any polygon boundary edge within tolerance.
 */
export function isPointOnBoundary(q: Point, polygon: Point[], tolerance = 1e-4): boolean {
  if (!polygon || polygon.length === 0) return false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (distanceToSegment(q, polygon[i], polygon[j]) <= tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether point lies strictly inside or on boundary of a polygon (Ray-Casting algorithm).
 */
export function isPointInPolygon(point: Point, polygon: Point[], includeBoundary = true): boolean {
  if (!polygon || polygon.length < 3) return false;
  if (includeBoundary && isPointOnBoundary(point, polygon)) return true;

  let inside = false;
  const { x, y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a circular seat with center point and radius lies completely within polygon boundary.
 */
export function isSeatCircleValid(
  center: Point,
  radius: number,
  polygon: Point[],
  tolerance = 1e-4
): boolean {
  if (!polygon || polygon.length < 3) return false;
  if (!isPointInPolygon(center, polygon, true)) return false;

  const minAllowed = radius - tolerance;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (distanceToSegment(center, polygon[i], polygon[j]) < minAllowed) {
      return false;
    }
  }
  return true;
}

/**
 * Generates N vertices approximating a circle centered at (cx, cy) with radius r.
 */
export function generateCirclePoints(cx: number, cy: number, r: number, numPoints = 32): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    pts.push({
      x: Math.round((cx + r * Math.cos(angle)) * 100) / 100,
      y: Math.round((cy + r * Math.sin(angle)) * 100) / 100,
    });
  }
  return pts;
}
