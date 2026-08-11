import { describe, it, expect } from 'vitest';
import { generateSeatGrid } from '@/lib/seatGenerator';
import { SectionDTO } from '@/types/venue';

describe('Stage Landmark Unit Tests', () => {
  it('generateSeatGrid returns 0 seats for STAGE section shapeType', () => {
    const seats = generateSeatGrid({
      geometry: {
        shapeType: 'STAGE',
        points: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 200 },
          { x: 100, y: 200 },
        ],
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      },
      rowCount: 8,
      seatsPerRow: 12,
    });

    expect(seats).toEqual([]);
    expect(seats.length).toBe(0);
  });

  it('Stage landmark section has 0 totalSeats and 0 availableSeats in SectionDTO contract', () => {
    const stageSection: SectionDTO = {
      id: 'stage-sec-1',
      name: 'Main Stage',
      code: 'STAGE',
      shapeType: 'STAGE',
      geometry: {
        shapeType: 'STAGE',
        points: [
          { x: 400, y: 50 },
          { x: 800, y: 50 },
          { x: 800, y: 150 },
          { x: 400, y: 150 },
        ],
      },
      price: 0,
      color: '#312e81',
      totalSeats: 0,
      availableSeats: 0,
    };

    expect(stageSection.shapeType).toBe('STAGE');
    expect(stageSection.totalSeats).toBe(0);
    expect(stageSection.availableSeats).toBe(0);
    expect(stageSection.price).toBe(0);
  });
});
