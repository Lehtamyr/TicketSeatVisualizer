'use client';

import React, { useMemo } from 'react';
import { SeatDTO, SectionDTO } from '@/types/venue';
import { calculateBoundingBox } from '@/lib/geometry';

interface SeatGridPickerProps {
  section: SectionDTO;
  seats: SeatDTO[];
  selectedIds: Set<string>;
  onToggleSeat: (seat: SeatDTO) => void;
}

export function SeatGridPicker({ section, seats, selectedIds, onToggleSeat }: SeatGridPickerProps) {
  const pts = section.geometry.points?.length >= 3
    ? section.geometry.points
    : (section.geometry.x !== undefined ? [
        { x: section.geometry.x, y: section.geometry.y! },
        { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! },
        { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! + section.geometry.height! },
        { x: section.geometry.x, y: section.geometry.y! + section.geometry.height! },
      ] : []);

  const bbox = useMemo(() => pts.length >= 3 ? calculateBoundingBox(pts) : { minX: 0, minY: 0, maxX: 600, maxY: 400, width: 600, height: 400 }, [pts]);

  const pad = 20;
  const vbX = bbox.minX - pad;
  const vbY = bbox.minY - pad;
  const vbW = bbox.width + pad * 2;
  const vbH = bbox.height + pad * 2;

  const SEAT_R = 7;

  const rowGroups = useMemo(() => {
    const groups: Record<string, SeatDTO[]> = {};
    for (const s of seats) {
      if (!groups[s.row]) groups[s.row] = [];
      groups[s.row].push(s);
    }
    return groups;
  }, [seats]);

  return (
    <div
      className="w-full h-full flex flex-col gap-2 seat-picker-grid-container"
    >
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="w-full flex-1"
        style={{ background: 'radial-gradient(ellipse at center, #0c1322 0%, #070a12 100%)' }}
      >
        <defs>
          <filter id="seat-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Section shape outline */}
        {pts.length >= 3 && (
          <path
            d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'}
            fill={`${section.color}18`}
            stroke={`${section.color}50`}
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
        )}

        {/* Row labels on the left */}
        {Object.entries(rowGroups).map(([row, rowSeats]) => {
          const minX = Math.min(...rowSeats.map((s) => s.x));
          const y = rowSeats[0].y;
          return (
            <text
              key={`row-label-${row}`}
              x={minX - SEAT_R - 4}
              y={y + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.3)"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              {row}
            </text>
          );
        })}

        {/* Seats */}
        {seats.map((seat) => {
          const isSelected = selectedIds.has(seat.id);
          const isAvailable = seat.status === 'AVAILABLE';
          const isHeld = seat.status === 'HELD';
          const isReserved = seat.status === 'RESERVED' || seat.status === 'BLOCKED';

          let fillClass = '';
          if (isSelected) fillClass = 'seat-selected';
          else if (isAvailable) fillClass = 'seat-available';
          else if (isHeld) fillClass = 'seat-held';
          else fillClass = 'seat-reserved';

          return (
            <circle
              key={seat.id}
              data-testid={`seat-button-${seat.id}`}
              data-status={isSelected ? 'SELECTED' : seat.status}
              cx={seat.x}
              cy={seat.y}
              r={SEAT_R}
              className={`seat-circle ${fillClass}${isSelected ? ' selected active' : ''}${isHeld ? ' held' : ''}`}
              filter={isSelected ? 'url(#seat-glow)' : undefined}
              role="button"
              aria-disabled={isReserved || isHeld ? 'true' : undefined}
              onClick={() => {
                if (!isReserved && !isHeld) onToggleSeat(seat);
              }}
              style={{ cursor: isReserved || isHeld ? 'not-allowed' : 'pointer' }}
            >
              <title>{isReserved ? 'Sold' : isHeld ? 'Held' : `Row ${seat.row} · Seat ${seat.number} · $${seat.price}`}</title>
            </circle>
          );
        })}

        {/* Seat number labels for selected */}
        {seats.filter((s) => selectedIds.has(s.id)).map((seat) => (
          <text
            key={`lbl-${seat.id}`}
            x={seat.x}
            y={seat.y + 3}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="5"
            fontFamily="Inter, sans-serif"
            style={{ pointerEvents: 'none' }}
          >
            {seat.number}
          </text>
        ))}
      </svg>

      {/* Row legend */}
      <div className="flex items-center justify-center gap-4 py-2 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--seat-available)' }} /> Available</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--seat-held)' }} /> Held</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--seat-reserved)' }} /> Reserved</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--seat-selected)' }} /> Selected</span>
      </div>
    </div>
  );
}
