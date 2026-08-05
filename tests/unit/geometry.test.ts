import { describe, it, expect } from 'vitest';
import {
  renderShapePath,
  calculateBoundingBox,
  calculateCentroid,
  isPointInPolygon,
  isSeatCircleValid,
  distanceToSegment,
  isPointOnBoundary,
} from '@/lib/geometry';
import { Point, SectionGeometry } from '@/types/venue';

describe('Geometry Engine Unit Tests (geometry.ts)', () => {
  describe('renderShapePath', () => {
    it('generates correct SVG path string for RECTANGLE with explicit points', () => {
      const geo: SectionGeometry = {
        shapeType: 'RECTANGLE',
        points: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 60 }, { x: 10, y: 60 }],
      };
      const path = renderShapePath(geo);
      expect(path).toBe('M 10 10 L 110 10 L 110 60 L 10 60 Z');
    });

    it('generates correct SVG path string for RECTANGLE from x, y, width, height fallback', () => {
      const geo: SectionGeometry = {
        shapeType: 'RECTANGLE',
        points: [],
        x: 20,
        y: 30,
        width: 200,
        height: 100,
      };
      const path = renderShapePath(geo);
      expect(path).toBe('M 20 30 L 220 30 L 220 130 L 20 130 Z');
    });

    it('generates correct SVG path string for SQUARE from x, y, width, height fallback', () => {
      const geo: SectionGeometry = {
        shapeType: 'SQUARE',
        points: [],
        x: 50,
        y: 50,
        width: 80,
        height: 80,
      };
      const path = renderShapePath(geo);
      expect(path).toBe('M 50 50 L 130 50 L 130 130 L 50 130 Z');
    });

    it('generates correct SVG path string for TRIANGLE', () => {
      const geo: SectionGeometry = {
        shapeType: 'TRIANGLE',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }],
      };
      const path = renderShapePath(geo);
      expect(path).toBe('M 0 0 L 100 0 L 50 80 Z');
    });

    it('generates correct SVG path string for POLYGON (5-vertex pentagon)', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: -30 },
        { x: 100, y: 0 },
        { x: 80, y: 70 },
        { x: 20, y: 70 },
      ];
      const geo: SectionGeometry = { shapeType: 'POLYGON', points };
      const path = renderShapePath(geo);
      expect(path).toBe('M 0 0 L 50 -30 L 100 0 L 80 70 L 20 70 Z');
    });

    it('handles invalid/empty geometry safely returning empty string', () => {
      const emptyGeo: SectionGeometry = { shapeType: 'RECTANGLE', points: [] };
      expect(renderShapePath(emptyGeo)).toBe('');
      // @ts-expect-error testing null input handling
      expect(renderShapePath(null)).toBe('');
    });
  });

  describe('calculateBoundingBox & calculateCentroid', () => {
    it('calculates accurate bounding box for standard rectangle', () => {
      const points: Point[] = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }];
      const bbox = calculateBoundingBox(points);
      expect(bbox).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70, width: 100, height: 50 });
    });

    it('calculates bounding box for skewed shape with negative coordinates', () => {
      const points: Point[] = [{ x: -50, y: -20 }, { x: 30, y: 80 }, { x: 100, y: -10 }];
      const bbox = calculateBoundingBox(points);
      expect(bbox).toEqual({ minX: -50, minY: -20, maxX: 100, maxY: 80, width: 150, height: 100 });
    });

    it('handles empty points array in bounding box calculation', () => {
      expect(calculateBoundingBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
    });

    it('calculates centroid for symmetric rectangle', () => {
      const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
      const centroid = calculateCentroid(points);
      expect(centroid.x).toBeCloseTo(50);
      expect(centroid.y).toBeCloseTo(30);
    });

    it('calculates centroid for right triangle', () => {
      const points: Point[] = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 60 }];
      const centroid = calculateCentroid(points);
      expect(centroid.x).toBeCloseTo(20);
      expect(centroid.y).toBeCloseTo(20);
    });

    it('calculates centroid for non-convex L-shaped polygon', () => {
      const lShape: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ];
      const centroid = calculateCentroid(lShape);
      expect(centroid.x).toBeCloseTo(125 / 3);
      expect(centroid.y).toBeCloseTo(125 / 3);
    });

    it('falls back to arithmetic mean for degenerate collinear points', () => {
      const points: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }];
      const centroid = calculateCentroid(points);
      expect(centroid.x).toBeCloseTo(50);
      expect(centroid.y).toBeCloseTo(0);
    });
  });

  describe('isPointInPolygon (Ray-Casting PIP)', () => {
    const rectangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const square: Point[] = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }];
    const isoscelesTriangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    const rightTriangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const lShape: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ];
    const star: Point[] = [
      { x: 0, y: 100 }, { x: 23, y: 31 }, { x: 95, y: 31 }, { x: 36, y: -12 },
      { x: 59, y: -81 }, { x: 0, y: -38 }, { x: -59, y: -81 }, { x: -36, y: -12 },
      { x: -95, y: 31 }, { x: -23, y: 31 },
    ];
    const arrowhead: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 100 }, { x: 30, y: 50 }];

    it('correctly classifies points in convex rectangle', () => {
      expect(isPointInPolygon({ x: 50, y: 25 }, rectangle)).toBe(true);
      expect(isPointInPolygon({ x: 5, y: 5 }, rectangle)).toBe(true);
      expect(isPointInPolygon({ x: -10, y: 25 }, rectangle)).toBe(false);
      expect(isPointInPolygon({ x: 50, y: 60 }, rectangle)).toBe(false);
    });

    it('correctly classifies points in square', () => {
      expect(isPointInPolygon({ x: 100, y: 100 }, square)).toBe(true);
      expect(isPointInPolygon({ x: 200, y: 100 }, square)).toBe(false);
    });

    it('correctly classifies points in isosceles triangle', () => {
      expect(isPointInPolygon({ x: 50, y: 30 }, isoscelesTriangle)).toBe(true);
      expect(isPointInPolygon({ x: 50, y: 90 }, isoscelesTriangle)).toBe(true);
      expect(isPointInPolygon({ x: 10, y: 80 }, isoscelesTriangle)).toBe(false);
      expect(isPointInPolygon({ x: 90, y: 80 }, isoscelesTriangle)).toBe(false);
    });

    it('correctly classifies points in right triangle', () => {
      expect(isPointInPolygon({ x: 20, y: 20 }, rightTriangle)).toBe(true);
      expect(isPointInPolygon({ x: 60, y: 60 }, rightTriangle)).toBe(false);
    });

    it('correctly classifies points in L-shaped non-convex polygon', () => {
      expect(isPointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true); // bottom-left block
      expect(isPointInPolygon({ x: 75, y: 25 }, lShape)).toBe(true); // bottom-right arm
      expect(isPointInPolygon({ x: 25, y: 75 }, lShape)).toBe(true); // top-left arm
      expect(isPointInPolygon({ x: 75, y: 75 }, lShape)).toBe(false); // top-right cutout nook
    });

    it('correctly classifies center and V-notch cutout in star shape', () => {
      expect(isPointInPolygon({ x: 0, y: 0 }, star)).toBe(true);
      expect(isPointInPolygon({ x: 50, y: 50 }, star)).toBe(false);
    });

    it('correctly classifies tip and rear concave indent in arrowhead polygon', () => {
      expect(isPointInPolygon({ x: 70, y: 50 }, arrowhead)).toBe(true);
      expect(isPointInPolygon({ x: 15, y: 50 }, arrowhead)).toBe(false);
    });

    it('handles border and vertex points properly', () => {
      expect(isPointInPolygon({ x: 50, y: 0 }, rectangle, true)).toBe(true);
      expect(isPointInPolygon({ x: 0, y: 0 }, rectangle, true)).toBe(true);
      expect(isPointInPolygon({ x: 1000, y: 1000 }, rectangle)).toBe(false);
    });
  });

  describe('isSeatCircleValid', () => {
    const rectangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];

    it('returns true when seat circle is completely inside polygon', () => {
      expect(isSeatCircleValid({ x: 50, y: 25 }, 10, rectangle)).toBe(true);
    });

    it('returns false when seat circle overflows polygon boundary edge', () => {
      expect(isSeatCircleValid({ x: 5, y: 25 }, 10, rectangle)).toBe(false);
    });

    it('returns false when seat circle center is outside polygon', () => {
      expect(isSeatCircleValid({ x: -5, y: 25 }, 10, rectangle)).toBe(false);
    });

    it('returns true when seat circle is exactly tangent to edge within tolerance', () => {
      expect(isSeatCircleValid({ x: 10, y: 25 }, 10, rectangle)).toBe(true);
    });

    it('returns false near inner corner of non-convex L-shape if circle overflows corner', () => {
      const lShape: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ];
      // Center (45, 45), radius 10: distance to corner segment (50,50) is < 10
      expect(isSeatCircleValid({ x: 45, y: 45 }, 10, lShape)).toBe(false);
    });
  });

  describe('distanceToSegment & isPointOnBoundary', () => {
    it('calculates exact distance to horizontal line segment', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 0 };
      expect(distanceToSegment({ x: 50, y: 10 }, a, b)).toBeCloseTo(10);
      expect(distanceToSegment({ x: -10, y: 0 }, a, b)).toBeCloseTo(10);
    });

    it('detects boundary point within tolerance', () => {
      const polygon: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
      expect(isPointOnBoundary({ x: 50, y: 0 }, polygon)).toBe(true);
      expect(isPointOnBoundary({ x: 50, y: 25 }, polygon)).toBe(false);
    });
  });
});
