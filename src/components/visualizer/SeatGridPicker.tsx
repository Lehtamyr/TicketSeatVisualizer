'use client';

import React, { useMemo, useState } from 'react';
import { SeatDTO, SectionDTO } from '@/types/venue';
import { calculateBoundingBox, renderShapePath } from '@/lib/geometry';
import { generateSeatGrid } from '@/lib/seatGenerator';

interface SeatGridPickerProps {
  section: SectionDTO;
  seats: SeatDTO[];
  selectedIds: Set<string>;
  onToggleSeat: (seat: SeatDTO) => void;
  adminMode?: boolean;
  disabledSeatKeys?: string[];
  sessionId?: string;
  onToggleDisabledSeat?: (sectionId: string, row: string, number: number) => void;
  onDeleteRow?: (rowLabel: string) => void;
}

export function SeatGridPicker({
  section,
  seats,
  selectedIds,
  onToggleSeat,
  adminMode = false,
  disabledSeatKeys = [],
  sessionId,
  onToggleDisabledSeat,
  onDeleteRow,
}: SeatGridPickerProps) {
  const pts = useMemo(() => {
    if (section.geometry.points?.length >= 3) return section.geometry.points;
    if (section.geometry.x !== undefined) {
      return [
        { x: section.geometry.x, y: section.geometry.y! },
        { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! },
        { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! + section.geometry.height! },
        { x: section.geometry.x, y: section.geometry.y! + section.geometry.height! },
      ];
    }
    return [];
  }, [section.geometry]);

  const bbox = useMemo(() => pts.length >= 3 ? calculateBoundingBox(pts) : { minX: 0, minY: 0, maxX: 600, maxY: 400, width: 600, height: 400 }, [pts]);

  // Use provided seats if present, fallback to unclipped grid generation if empty
  const displaySeats = useMemo(() => {
    const isStage = section.shapeType === 'STAGE' || section.geometry?.shapeType === 'STAGE';
    if (isStage) return [];

    const sourceSeats = (seats && seats.length > 0) ? seats : (
      generateSeatGrid({
        geometry: { ...section.geometry, clipToBoundary: false, disabledSeats: adminMode ? [] : (disabledSeatKeys || []) },
        rowCount: (section as any).rowCount || 8,
        seatsPerRow: (section as any).seatsPerRow || 12,
        seatRadius: 7,
        padding: 14,
        sectionId: section.id,
      }) as SeatDTO[]
    );

    const defaultPrice = section?.price ?? 50;
    return sourceSeats.map((s) => ({
      ...s,
      id: s.id || `${section.id}-${s.row}-${s.number}`,
      sectionId: s.sectionId || section.id,
      status: s.status || 'AVAILABLE',
      price: s.price ?? (s as any).priceOverride ?? defaultPrice,
    }));
  }, [section, seats]);

  const pad = 35;

  // Extract unique sorted rows and columns/numbers to build a perfectly spaced layout grid
  const uniqueRows = useMemo(() => {
    return Array.from(new Set(displaySeats.map((s) => s.row))).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [displaySeats]);

  const uniqueNumbers = useMemo(() => {
    return Array.from(new Set(displaySeats.map((s) => s.number))).sort((a, b) => a - b);
  }, [displaySeats]);

  // Compute scaled seat rendering positions based strictly on grid indices to prevent vertical or horizontal overlap
  const scaledSeats = useMemo(() => {
    return displaySeats.map((s) => {
      const rowIndex = uniqueRows.indexOf(s.row);
      const colIndex = uniqueNumbers.indexOf(s.number);
      return {
        ...s,
        renderX: colIndex * 46,
        renderY: rowIndex * 46,
      };
    });
  }, [displaySeats, uniqueRows, uniqueNumbers]);

  const scaledMinX = 0;
  const scaledMaxX = Math.max(0, (uniqueNumbers.length - 1) * 46);
  const scaledMinY = 0;
  const scaledMaxY = Math.max(0, (uniqueRows.length - 1) * 46);

  const scaledTightW = scaledMaxX - scaledMinX;
  const scaledTightH = scaledMaxY - scaledMinY;

  const leftPad = adminMode ? 55 : 45;

  const vbX = scaledMinX - leftPad;
  const vbY = scaledMinY - pad;
  const vbW = scaledTightW + leftPad + pad * 2;
  const vbH = scaledTightH + pad * 2;

  // Standardized seat radius (15.0 radius / 30px diameter) for comfortably large click targets
  const SEAT_R = 15.0;
  const seatStrokeW = 1.2;

  const [zoomScale, setZoomScale] = useState<number>(1.0);

  const rowGroups = useMemo(() => {
    const groups: Record<string, (SeatDTO & { renderX: number; renderY: number })[]> = {};
    for (const s of scaledSeats) {
      if (!groups[s.row]) groups[s.row] = [];
      groups[s.row].push(s);
    }
    return groups;
  }, [scaledSeats]);

  const maxSeatsInAnyRow = uniqueNumbers.length;
  const rowCount = uniqueRows.length;

  const displayScale = 1.2;
  const svgWidthPx = Math.round(vbW * displayScale * zoomScale);
  const svgHeightPx = Math.round(vbH * displayScale * zoomScale);

  return (
    <div className="w-full h-full flex flex-col gap-3 seat-picker-grid-container overflow-hidden">
      {/* Zoom & Navigation Toolbar Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary border border-subtle rounded-xl text-xs select-none">
        <span className="text-secondary flex items-center gap-1.5 text-[11px]">
          <span>↔️</span>
          <span>Scroll or pan grid to view all seats without crowding</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.max(0.6, z - 0.15))}
            className="w-7 h-7 bg-secondary hover:bg-accent hover:text-white rounded-lg text-secondary flex items-center justify-center font-bold text-sm transition-colors"
            title="Zoom Out (-)"
          >
            -
          </button>
          <span className="text-secondary font-mono text-[11px] w-10 text-center font-semibold">{Math.round(zoomScale * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.min(2.5, z + 0.15))}
            className="w-7 h-7 bg-secondary hover:bg-accent hover:text-white rounded-lg text-secondary flex items-center justify-center font-bold text-sm transition-colors"
            title="Zoom In (+)"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomScale(1.0)}
            className="px-2 py-1 bg-secondary hover:bg-accent hover:text-white rounded-lg text-secondary hover:text-primary text-[10px] font-semibold transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Standardized Scrollable Seat Viewport Container with 100% working Overflow */}
      <div
        className="w-full flex-1 overflow-x-auto overflow-y-auto rounded-2xl border border-default p-4 shadow-2xl relative select-none custom-scrollbar"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="min-w-max min-h-max flex flex-col items-center justify-start p-8">
          <svg
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            style={{
              overflow: 'visible',
              width: `${svgWidthPx}px`,
              height: `${svgHeightPx}px`,
              maxWidth: 'none',
              maxHeight: 'none',
              transition: 'all 0.15s ease-out',
            }}
            className="mx-auto block"
          >
          <defs>
            <filter id="seat-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Column number header labels — constant font size, one per column */}
          {uniqueNumbers.map((num, colIndex) => (
            <text
              key={`col-header-${num}`}
              x={colIndex * 46}
              y={scaledMinY - SEAT_R - 8}
              textAnchor="middle"
              fill="var(--canvas-text)"
              fontSize="9.5"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {num}
            </text>
          ))}

          {/* Row labels & Admin row delete actions */}

          {Object.entries(rowGroups).map(([row, rowSeats]) => {
            const minX = scaledMinX;
            const y = rowSeats[0].renderY;
            return (
              <g key={`row-group-${row}`}>
                <text
                  x={minX - SEAT_R - (adminMode ? 32 : 12)}
                  y={y + 4.5}
                  textAnchor="end"
                  fill="var(--canvas-text)"
                  fontSize="11.5"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Row {row}
                </text>

                {adminMode && onDeleteRow && (
                  <g
                    onClick={() => onDeleteRow(row)}
                    className="cursor-pointer hover:opacity-100 opacity-60 transition-opacity"
                  >
                    <title>{`Delete Row ${row}`}</title>
                    <rect
                      x={minX - SEAT_R - 26}
                      y={y - 6}
                      width="20"
                      height="12"
                      rx="3"
                      fill="rgba(239, 68, 68, 0.25)"
                      stroke="rgba(239, 68, 68, 0.6)"
                      strokeWidth="0.8"
                    />
                    <text
                      x={minX - SEAT_R - 16}
                      y={y + 3}
                      textAnchor="middle"
                      fill="var(--seat-reserved)"
                      fontSize="7"
                      fontWeight="bold"
                    >
                      🗑
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Seats with Dual-Stroke Non-Overlapping Border Rings */}
          {scaledSeats.map((seat) => {
            const seatKey = `${seat.row}-${seat.number}`;
            const isDisabledInAdmin = disabledSeatKeys.includes(seatKey);
            const isSelected = selectedIds.has(seat.id);
            // ponytail: If it's HELD and we didn't select it, it's held by someone else. 
            // The DB doesn't return heldBy, so checking it was a bug.
            const isHeld = seat.status === 'HELD' && !isSelected;
            const isReserved = (seat.status === 'RESERVED' || seat.status === 'BLOCKED') && !adminMode;
            const isAvailable = !isSelected && !isHeld && !isReserved && !isDisabledInAdmin;
            const isBlocked = adminMode ? false : (isSelected ? false : (isReserved || isHeld || isDisabledInAdmin));

            let fillClass = '';
            if (isSelected) fillClass = 'seat-selected';
            else if (isDisabledInAdmin) fillClass = 'seat-disabled-admin';
            else if (isAvailable) fillClass = 'seat-available';
            else if (isHeld) fillClass = 'seat-held';
            else fillClass = 'seat-reserved';

            const strokeColor = isSelected
              ? 'var(--accent-primary)'
              : isDisabledInAdmin
              ? 'rgba(239, 68, 68, 0.85)'
              : isAvailable
              ? 'rgba(0,0,0,0.15)'
              : isHeld
              ? '#f59e0b'
              : 'rgba(0,0,0,0.1)';

            if (isDisabledInAdmin && !adminMode) return null; // ponytail: completely hide admin-disabled seats from users

            const testIdAttr = `seat-button-${seat.id}`;

            return (
              <g key={seat.id}>
                {/* Outer dark isolating ring preventing circle overlap */}
                <circle
                  cx={seat.renderX}
                  cy={seat.renderY}
                  r={SEAT_R + 1.5}
                  fill="none"
                  stroke="var(--bg-primary)"
                  strokeWidth="2.5"
                  style={{ pointerEvents: 'none' }}
                />

                {/* Inner Seat Circle */}
                <circle
                  data-testid={testIdAttr}
                  data-status={isSelected ? 'SELECTED' : seat.status}
                  cx={seat.renderX}
                  cy={seat.renderY}
                  r={SEAT_R}
                  fill={isDisabledInAdmin ? "rgba(239, 68, 68, 0.25)" : undefined}
                  stroke={strokeColor}
                  strokeWidth={isDisabledInAdmin ? 1.5 : seatStrokeW}
                  strokeDasharray={isDisabledInAdmin ? "2.5 1.5" : undefined}
                  className={`seat-circle ${fillClass}${isSelected ? ' selected active' : ''}${isHeld ? ' held' : ''}`}
                  filter={isSelected ? 'url(#seat-glow)' : undefined}
                  role="button"
                  aria-disabled={isBlocked ? 'true' : undefined}
                  onClick={() => {
                    if (adminMode && onToggleDisabledSeat) {
                      onToggleDisabledSeat(section.id, seat.row, seat.number);
                    } else if (!isBlocked) {
                      onToggleSeat(seat);
                    }
                  }}
                  style={{ cursor: isBlocked ? 'not-allowed' : 'pointer', pointerEvents: 'auto' }}
                >
                  <title>{isDisabledInAdmin ? (adminMode ? 'Disabled Seat (Click to restore)' : 'Disabled / Unavailable Seat') : isReserved ? 'Sold' : isHeld ? 'Held' : `Row ${seat.row} · Seat ${seat.number} · $${seat.price}`}</title>
                </circle>
              </g>
            );
          })}

          {/* Seat number labels for selected */}
          {scaledSeats.filter((s) => selectedIds.has(s.id)).map((seat) => (
            <text
              key={`label-${seat.id}`}
              x={seat.renderX}
              y={seat.renderY + 3.5}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize="9.5"
              fontWeight="bold"
              fontFamily="Inter, sans-serif"
              style={{ pointerEvents: 'none' }}
            >
              {seat.number}
            </text>
          ))}
        </svg>
        </div>
      </div>

      {/* Row legend */}
      <div className="flex items-center justify-center gap-4 py-1 text-xs text-secondary flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-white/40" style={{ background: 'var(--seat-available)' }} /> Available</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-accent/40" style={{ background: 'var(--seat-held)' }} /> Held</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-white/20" style={{ background: 'var(--seat-reserved)' }} /> Reserved</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-accent" style={{ background: 'var(--seat-selected)' }} /> Selected</span>
        {adminMode && (
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-dashed border-accent bg-accent/20" /> Disabled Seat</span>
        )}
      </div>
    </div>
  );
}
