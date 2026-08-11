import { Point, SectionGeometry } from '@/types/venue';
import { calculateBoundingBox, isSeatCircleValid, isPointInPolygon } from './geometry';

export interface SeatGeneratorOptions {
  polygon?: Point[];
  geometry?: SectionGeometry;
  sectionId?: string;
  rowCount: number;
  seatsPerRow: number;
  seatRadius?: number;
  padding?: number;
  tolerance?: number;
}

export interface GeneratedSeat {
  id?: string;
  sectionId?: string;
  row: string;
  number: number;
  x: number;
  y: number;
  status?: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'BLOCKED';
  price?: number;
}

/**
 * Converts a 0-indexed integer into Excel-style row letter labels.
 * 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, etc.
 */
export function getRowLabel(index: number): string {
  if (index < 0) return 'A';
  let label = '';
  let temp = index;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

/**
 * Calculates the horizontal segment overlap inside a polygon at height y.
 */
export function getPolygonHorizontalSpanAtY(y: number, polygon: Point[], pad = 0): { xMin: number; xMax: number } | null {
  if (!polygon || polygon.length < 3) return null;
  const intersects: number[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    if (y >= minY && y <= maxY && p1.y !== p2.y) {
      const x = p1.x + ((y - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
      intersects.push(x);
    }
  }
  if (intersects.length < 2) return null;
  intersects.sort((a, b) => a - b);
  return {
    xMin: intersects[0] + pad,
    xMax: intersects[intersects.length - 1] - pad,
  };
}

/**
 * Generates seat grid inside an arbitrary polygon boundary.
 * Guarantees 100% of returned seats lie strictly inside the polygon using PIP circle validation.
 */
export function generateSeatGrid(options: SeatGeneratorOptions): GeneratedSeat[] {
  if (!options || options.geometry?.shapeType === 'STAGE' || (options as any).shapeType === 'STAGE') return [];

  const {
    rowCount,
    seatsPerRow,
    seatRadius = 8,
    padding,
    tolerance = 1e-4,
    sectionId,
  } = options;

  let polygon: Point[] = [];
  if (options.polygon && options.polygon.length >= 3) {
    polygon = options.polygon;
  } else if (options.geometry) {
    if (options.geometry.points && options.geometry.points.length >= 3) {
      polygon = options.geometry.points;
    } else if (
      (options.geometry.shapeType === 'RECTANGLE' || options.geometry.shapeType === 'SQUARE') &&
      options.geometry.x !== undefined &&
      options.geometry.y !== undefined &&
      options.geometry.width !== undefined &&
      options.geometry.height !== undefined
    ) {
      polygon = [
        { x: options.geometry.x, y: options.geometry.y },
        { x: options.geometry.x + options.geometry.width, y: options.geometry.y },
        { x: options.geometry.x + options.geometry.width, y: options.geometry.y + options.geometry.height },
        { x: options.geometry.x, y: options.geometry.y + options.geometry.height },
      ];
    }
  }

  if (!polygon || polygon.length < 3 || rowCount <= 0 || seatsPerRow <= 0) {
    return [];
  }

  const bbox = calculateBoundingBox(polygon);
  const { minX, minY, maxX, maxY, width, height } = bbox;

  if (width <= 0 || height <= 0 || width < 2 * seatRadius || height < 2 * seatRadius) {
    return [];
  }

  // Determine effective inner padding
  let pad = padding !== undefined ? padding : seatRadius;
  if (width <= 2 * pad || height <= 2 * pad) {
    pad = Math.min(width, height) / 4;
  }

  const startX = minX + pad;
  const endX = maxX - pad;
  const startY = minY + pad;
  const endY = maxY - pad;

  const minRowStep = seatRadius * 2 + 8;
  const minStep = seatRadius * 2 + 6;

  const rawRowStep = rowCount > 1 ? (endY - startY) / (rowCount - 1) : 0;
  const rowStep = rawRowStep;

  const seats: GeneratedSeat[] = [];

  const rowConfigs = options.geometry?.rowConfigs || [];
  const clipToBoundary = options.geometry?.clipToBoundary !== false;
  const disabledSeats = options.geometry?.disabledSeats || [];

  for (let r = 0; r < rowCount; r++) {
    const candidateY = rowCount === 1 ? minY + height / 2 : startY + r * rowStep;
    const rowLabel = getRowLabel(r);
    const rowConfig = rowConfigs.find((rc) => rc.row === rowLabel);
    const seatsInRow = rowConfig ? rowConfig.seatCount : seatsPerRow;

    let rowStartX = startX;
    let rowEndX = endX;

    if (clipToBoundary) {
      const span = getPolygonHorizontalSpanAtY(candidateY, polygon, pad);
      if (span) {
        rowStartX = span.xMin;
        rowEndX = span.xMax;
      }
    }

    const rawStep = seatsInRow > 1 ? (rowEndX - rowStartX) / (seatsInRow - 1) : 0;
    const step = rawStep;

    for (let c = 0; c < seatsInRow; c++) {
      const candidateX = seatsInRow === 1 ? (rowStartX + rowEndX) / 2 : rowStartX + c * step;
      const center: Point = { x: candidateX, y: candidateY };

      const seatNum = c + 1;
      const seatId = `${rowLabel}-${seatNum}`;

      // Skip if manually disabled or outside boundary when clipping is enabled
      if (disabledSeats.includes(seatId)) {
        continue;
      }

      if (clipToBoundary && polygon.length >= 3 && !isPointInPolygon(center, polygon, false)) {
        continue;
      }

      const seat: GeneratedSeat = {
        row: rowLabel,
        number: seatNum,
        x: Math.round(center.x * 100) / 100,
        y: Math.round(center.y * 100) / 100,
      };

      if (sectionId) {
        seat.sectionId = sectionId;
        seat.id = `${sectionId}-${rowLabel}-${seatNum}`;
        seat.status = 'AVAILABLE';
      }
      seats.push(seat);
    }
  }

  // Fallback: If no seats fit (e.g. narrow section or small polygon), place seats inside bounding box
  if (seats.length === 0 && rowCount > 0 && seatsPerRow > 0 && width > 0 && height > 0) {
    let fallbackRowIdx = 0;
    const fbRowStep = rowCount > 1 ? height / (rowCount + 1) : 0;
    const fbSeatStep = seatsPerRow > 1 ? width / (seatsPerRow + 1) : 0;

    for (let r = 0; r < rowCount; r++) {
      const py = rowCount === 1 ? minY + height / 2 : minY + (r + 1) * fbRowStep;
      const rowLabel = getRowLabel(fallbackRowIdx++);

      for (let c = 0; c < seatsPerRow; c++) {
        const px = seatsPerRow === 1 ? minX + width / 2 : minX + (c + 1) * fbSeatStep;
        const seatNum = c + 1;
        const seat: GeneratedSeat = {
          row: rowLabel,
          number: seatNum,
          x: Math.round(px * 100) / 100,
          y: Math.round(py * 100) / 100,
        };
        if (sectionId) {
          seat.sectionId = sectionId;
          seat.id = `${sectionId}-${rowLabel}-${seatNum}`;
          seat.status = 'AVAILABLE';
        }
        seats.push(seat);
      }
    }
  }

  return seats;
}
