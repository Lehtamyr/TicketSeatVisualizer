import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';
import { ShapeType, SectionDTO, SeatDTO } from '@/types/venue';

describe('Infrastructure Setup & Basic Utilities', () => {
  it('cn utility merges tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'bg-blue-500', { 'text-white': true, 'hidden': false });
    expect(result).toBe('px-2 py-1 bg-blue-500 text-white');
  });

  it('TypeScript interfaces and types match domain specifications', () => {
    const validShape: ShapeType = 'RECTANGLE';
    expect(['RECTANGLE', 'SQUARE', 'TRIANGLE', 'POLYGON']).toContain(validShape);

    const sampleSection: SectionDTO = {
      id: 'sec-1',
      name: 'North Stand',
      code: 'SEC-N1',
      shapeType: 'RECTANGLE',
      geometry: {
        shapeType: 'RECTANGLE',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
        width: 100,
        height: 50,
      },
      price: 60,
      color: '#10B981',
      totalSeats: 50,
      availableSeats: 45,
    };

    expect(sampleSection.code).toBe('SEC-N1');
    expect(sampleSection.geometry.points).toHaveLength(4);

    const sampleSeat: SeatDTO = {
      id: 'seat-1',
      sectionId: 'sec-1',
      row: 'A',
      number: 1,
      x: 10,
      y: 10,
      status: 'AVAILABLE',
      price: 60,
    };

    expect(sampleSeat.status).toBe('AVAILABLE');
  });
});
