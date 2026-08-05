import { describe, it, expect } from 'vitest';
import { generateSeatGrid, getRowLabel } from '@/lib/seatGenerator';
import { isPointInPolygon, isSeatCircleValid } from '@/lib/geometry';
import { SectionGeometry, Point } from '@/types/venue';

describe('Seat Grid Auto-Generator Engine Unit Tests (seatGenerator.ts)', () => {
  const rectGeo: SectionGeometry = {
    shapeType: 'RECTANGLE',
    points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
  };

  const triGeo: SectionGeometry = {
    shapeType: 'TRIANGLE',
    points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }],
  };

  const lShapeGeo: SectionGeometry = {
    shapeType: 'POLYGON',
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ],
  };

  describe('generateSeatGrid Layout Generation', () => {
    it('generates complete seat grid in rectangular section', () => {
      const seats = generateSeatGrid({
        sectionId: 'sec-rect',
        geometry: rectGeo,
        rowCount: 5,
        seatsPerRow: 10,
        seatRadius: 8,
      });

      expect(seats.length).toBe(50);
      expect(seats[0].row).toBe('A');
      expect(seats[0].number).toBe(1);
      expect(seats[0].sectionId).toBe('sec-rect');
      expect(seats[0].id).toBe('sec-rect-A-1');
    });

    it('generates partial seat grid bounded inside triangular section', () => {
      const seats = generateSeatGrid({
        sectionId: 'sec-tri',
        geometry: triGeo,
        rowCount: 5,
        seatsPerRow: 10,
        seatRadius: 8,
      });

      expect(seats.length).toBeGreaterThan(0);
      expect(seats.length).toBeLessThan(50);
    });

    it('generates seat grid inside L-shaped non-convex section without seats in cutout', () => {
      const seats = generateSeatGrid({
        sectionId: 'sec-lshape',
        geometry: lShapeGeo,
        rowCount: 6,
        seatsPerRow: 10,
        seatRadius: 8,
      });

      // Confirm no seat is placed in the top-right cutout quadrant (x > 100 && y > 100)
      const invalidCutoutSeats = seats.filter((s) => s.x > 100 && s.y > 100);
      expect(invalidCutoutSeats).toEqual([]);
    });

    it('accepts options.polygon directly', () => {
      const polygon: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const seats = generateSeatGrid({
        polygon,
        rowCount: 2,
        seatsPerRow: 3,
      });
      expect(seats.length).toBe(6);
    });
  });

  describe('100% PIP Boundary Containment Assertion', () => {
    it('asserts 100% of seats in rectangular section pass isPointInPolygon', () => {
      const seats = generateSeatGrid({ geometry: rectGeo, rowCount: 5, seatsPerRow: 10 });
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) {
        expect(isPointInPolygon({ x: seat.x, y: seat.y }, rectGeo.points)).toBe(true);
      }
    });

    it('asserts 100% of seats in triangular section pass isPointInPolygon', () => {
      const seats = generateSeatGrid({ geometry: triGeo, rowCount: 5, seatsPerRow: 10 });
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) {
        expect(isPointInPolygon({ x: seat.x, y: seat.y }, triGeo.points)).toBe(true);
      }
    });

    it('asserts 100% of seats in L-shaped section pass isPointInPolygon', () => {
      const seats = generateSeatGrid({ geometry: lShapeGeo, rowCount: 6, seatsPerRow: 10 });
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) {
        expect(isPointInPolygon({ x: seat.x, y: seat.y }, lShapeGeo.points)).toBe(true);
      }
    });

    it('asserts 100% of seats pass isSeatCircleValid radius check', () => {
      const radius = 8;
      const seats = generateSeatGrid({
        geometry: rectGeo,
        rowCount: 4,
        seatsPerRow: 8,
        seatRadius: radius,
      });
      for (const seat of seats) {
        expect(isSeatCircleValid({ x: seat.x, y: seat.y }, radius, rectGeo.points)).toBe(true);
      }
    });
  });

  describe('Row Labeling & Seat Numbering Contracts', () => {
    it('generates correct row labels (A..Z, AA..ZZ)', () => {
      expect(getRowLabel(0)).toBe('A');
      expect(getRowLabel(1)).toBe('B');
      expect(getRowLabel(25)).toBe('Z');
      expect(getRowLabel(26)).toBe('AA');
      expect(getRowLabel(27)).toBe('AB');
      expect(getRowLabel(51)).toBe('AZ');
      expect(getRowLabel(52)).toBe('BA');
      expect(getRowLabel(-1)).toBe('A');
    });

    it('numbers seats sequentially per row starting at 1', () => {
      const seats = generateSeatGrid({ geometry: rectGeo, rowCount: 2, seatsPerRow: 5 });
      const rowA = seats.filter((s) => s.row === 'A');
      expect(rowA.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);

      const rowB = seats.filter((s) => s.row === 'B');
      expect(rowB.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    });

    it('maintains continuous active row labels when candidate rows are empty', () => {
      // Triangle where top apex yields 0 valid seats
      const sharpTri: SectionGeometry = {
        shapeType: 'TRIANGLE',
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 300 }],
      };
      const seats = generateSeatGrid({ geometry: sharpTri, rowCount: 10, seatsPerRow: 5, seatRadius: 15 });
      const rowLabels = Array.from(new Set(seats.map((s) => s.row)));
      // Ensure row labels start at A and increment without skipping letters
      expect(rowLabels[0]).toBe('A');
      for (let i = 0; i < rowLabels.length; i++) {
        expect(rowLabels[i]).toBe(getRowLabel(i));
      }
    });
  });

  describe('Edge Cases & Parameter Handling', () => {
    it('handles zero or negative rowCount gracefully', () => {
      expect(generateSeatGrid({ geometry: rectGeo, rowCount: 0, seatsPerRow: 10 })).toEqual([]);
      expect(generateSeatGrid({ geometry: rectGeo, rowCount: -5, seatsPerRow: 10 })).toEqual([]);
    });

    it('handles zero or negative seatsPerRow gracefully', () => {
      expect(generateSeatGrid({ geometry: rectGeo, rowCount: 5, seatsPerRow: 0 })).toEqual([]);
      expect(generateSeatGrid({ geometry: rectGeo, rowCount: 5, seatsPerRow: -10 })).toEqual([]);
    });

    it('handles empty or invalid geometry points gracefully', () => {
      const emptyGeo: SectionGeometry = { shapeType: 'RECTANGLE', points: [] };
      expect(generateSeatGrid({ geometry: emptyGeo, rowCount: 5, seatsPerRow: 10 })).toEqual([]);
      // @ts-expect-error testing invalid input
      expect(generateSeatGrid(null)).toEqual([]);
    });

    it('handles polygon too small for seat radius gracefully', () => {
      const tinyPolygon: Point[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
      const seats = generateSeatGrid({ polygon: tinyPolygon, rowCount: 2, seatsPerRow: 2, seatRadius: 10 });
      expect(seats).toEqual([]);
    });

    it('handles single seat / single row requests', () => {
      const seats1x1 = generateSeatGrid({ geometry: rectGeo, rowCount: 1, seatsPerRow: 1 });
      expect(seats1x1.length).toBe(1);
      expect(seats1x1[0].row).toBe('A');
      expect(seats1x1[0].number).toBe(1);
    });
  });
});
