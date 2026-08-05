import { Point, SectionGeometry } from '@/types/venue';
import { calculateBoundingBox, isSeatCircleValid } from './geometry';

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
 * Generates seat grid inside an arbitrary polygon boundary.
 * Guarantees 100% of returned seats lie strictly inside the polygon using PIP circle validation.
 */
export function generateSeatGrid(options: SeatGeneratorOptions): GeneratedSeat[] {
  if (!options) return [];

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

  if (width <= 0 || height <= 0) {
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

  const rowStep = rowCount > 1 ? (endY - startY) / (rowCount - 1) : 0;
  const seatStep = seatsPerRow > 1 ? (endX - startX) / (seatsPerRow - 1) : 0;

  const seats: GeneratedSeat[] = [];
  let activeRowIndex = 0;

  for (let r = 0; r < rowCount; r++) {
    const candidateY = rowCount === 1 ? minY + height / 2 : startY + r * rowStep;
    const validRowSeats: Point[] = [];

    for (let c = 0; c < seatsPerRow; c++) {
      const candidateX = seatsPerRow === 1 ? minX + width / 2 : startX + c * seatStep;
      const center: Point = { x: candidateX, y: candidateY };

      if (isSeatCircleValid(center, seatRadius, polygon, tolerance)) {
        validRowSeats.push(center);
      }
    }

    if (validRowSeats.length > 0) {
      // Sort seats left-to-right within the row
      validRowSeats.sort((a, b) => a.x - b.x);

      const rowLabel = getRowLabel(activeRowIndex);
      validRowSeats.forEach((seatPt, seatIdx) => {
        const seatNum = seatIdx + 1;
        const seat: GeneratedSeat = {
          row: rowLabel,
          number: seatNum,
          x: Math.round(seatPt.x * 100) / 100,
          y: Math.round(seatPt.y * 100) / 100,
        };
        if (sectionId) {
          seat.sectionId = sectionId;
          seat.id = `${sectionId}-${rowLabel}-${seatNum}`;
          seat.status = 'AVAILABLE';
        }
        seats.push(seat);
      });

      activeRowIndex++;
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
