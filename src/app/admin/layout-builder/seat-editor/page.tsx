'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Point, ShapeType, SectionGeometry } from '@/types/venue';
import { generateSeatGrid, GeneratedSeat, getRowLabel } from '@/lib/seatGenerator';
import { renderShapePath, calculateCentroid, calculateBoundingBox } from '@/lib/geometry';
import { SeatGridPicker } from '@/components/visualizer/SeatGridPicker';
import {
  ArrowLeft, Grid3X3, Save, Loader2, CheckCircle, Eye, EyeOff, X, RefreshCw
} from 'lucide-react';

interface AdminSection {
  id: string;
  name: string;
  code: string;
  shapeType: ShapeType;
  geometry: SectionGeometry;
  color: string;
  price: number;
  rowCount: number;
  seatsPerRow: number;
  seats: GeneratedSeat[];
  showSeats: boolean;
}

const COLORS = [
  '#6366f1', '#818cf8', '#4f46e5',
  '#22d3ee', '#06b6d4', '#14b8a6',
  '#10b981', '#059669', '#84cc16',
  '#f59e0b', '#d97706', '#eab308',
  '#fb923c', '#ea580c', '#ff7849',
  '#ef4444', '#dc2626', '#f43f5e',
  '#a78bfa', '#7c3aed', '#c084fc',
  '#e879f9', '#f472b6', '#db2777',
  '#64748b', '#94a3b8'
];

function SeatEditorWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const layoutId = searchParams.get('layoutId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [layoutName, setLayoutName] = useState('Venue Layout');
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [canvasHeight, setCanvasHeight] = useState(700);
  const [sections, setSections] = useState<AdminSection[]>([]);

  // Selection/zoom view state
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Load layout data
  useEffect(() => {
    const fetchLayout = async () => {
      if (!layoutId) {
        setError('Missing layoutId parameter');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/layouts?layoutId=${layoutId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch layout');
        }
        const result = await response.json();
        const data = result.data;
        if (!data) {
          throw new Error('Layout not found');
        }

        setLayoutName(data.name || 'Venue Layout');
        setCanvasWidth(data.canvasWidth || 1000);
        setCanvasHeight(data.canvasHeight || 700);

        const mapped = (data.sections || []).map((s: any) => {
          let geom = s.geometry;
          if (typeof geom === 'string') {
            try { geom = JSON.parse(geom); } catch { }
          }
          if (geom && typeof geom === 'object') {
            geom = { ...geom, clipToBoundary: geom.clipToBoundary === true };
          }
          return {
            id: s.id,
            name: s.name,
            code: s.code,
            shapeType: s.shapeType,
            geometry: geom,
            color: s.color || '#3B82F6',
            price: s.price || 50,
            rowCount: s.rowCount || 8,
            seatsPerRow: s.seatsPerRow || 12,
            seats: s.seats || [],
            showSeats: s.showSeats !== false,
          };
        });

        setSections(mapped);
      } catch (err: any) {
        setError(err.message || 'Failed to load layout');
      } finally {
        setLoading(false);
      }
    };

    fetchLayout();
  }, [layoutId]);

  // Generate seats helper
  const generateSeats = useCallback((geometry: SectionGeometry, rowCount: number, seatsPerRow: number): GeneratedSeat[] => {
    return generateSeatGrid({ geometry: { ...geometry, disabledSeats: [] }, rowCount, seatsPerRow, seatRadius: 7, padding: 14 });
  }, []);

  // Update section values
  const updateSection = useCallback((id: string, patch: Partial<AdminSection>) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, ...patch };
      if ('rowCount' in patch || 'seatsPerRow' in patch || 'geometry' in patch) {
        updated.seats = generateSeats(updated.geometry, updated.rowCount, updated.seatsPerRow);
      }
      return updated;
    }));
  }, [generateSeats]);

  // Toggle single seat active/disabled
  const handleToggleSeat = useCallback((sectionId: string, row: string, number: number) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;

      const seatKey = `${row}-${number}`;
      const currentDisabled = s.geometry.disabledSeats || [];
      const updatedDisabled = currentDisabled.includes(seatKey)
        ? currentDisabled.filter((id) => id !== seatKey)
        : [...currentDisabled, seatKey];

      const updatedGeometry = {
        ...s.geometry,
        disabledSeats: updatedDisabled,
      };

      return {
        ...s,
        geometry: updatedGeometry,
        seats: generateSeats(updatedGeometry, s.rowCount, s.seatsPerRow),
      };
    }));
  }, [generateSeats]);

  // Toggle full row active/disabled
  const handleToggleRow = useCallback((sectionId: string, rowLabel: string) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const rowSeats = generateSeats(
        { ...s.geometry, disabledSeats: [] },
        s.rowCount,
        s.seatsPerRow
      ).filter((st) => st.row === rowLabel);

      const rowKeys = rowSeats.map((st) => `${st.row}-${st.number}`);
      const currentDisabled = s.geometry.disabledSeats || [];
      const isRowFullyDisabled = rowKeys.every((k) => currentDisabled.includes(k));

      let updatedDisabled: string[];
      if (isRowFullyDisabled) {
        // Restore row
        updatedDisabled = currentDisabled.filter((k) => !rowKeys.includes(k));
      } else {
        // Disable row
        updatedDisabled = Array.from(new Set([...currentDisabled, ...rowKeys]));
      }

      const updatedGeometry = {
        ...s.geometry,
        disabledSeats: updatedDisabled,
      };

      return {
        ...s,
        geometry: updatedGeometry,
        seats: generateSeats(updatedGeometry, s.rowCount, s.seatsPerRow),
      };
    }));
  }, [generateSeats]);

  // Save changes
  const handleSave = async () => {
    setSaving(true); setSavedOk(false); setError(null);
    try {
      const response = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutId: layoutId || undefined,
          name: layoutName,
          canvasWidth,
          canvasHeight,
          sections: sections.map((s) => ({
            name: s.name,
            code: s.code,
            shapeType: s.shapeType,
            geometry: { ...s.geometry, clipToBoundary: false },
            price: s.price,
            color: s.color,
            rowCount: s.rowCount,
            seatsPerRow: s.seatsPerRow,
            seats: s.seats.map((seat) => ({ row: seat.row, number: seat.number, x: seat.x, y: seat.y })),
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save seating configurations');
      }

      setSavedOk(true);
      setTimeout(() => {
        setSavedOk(false);
        router.push('/admin');
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to save layouts');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#07090f] text-slate-400 gap-2">
        <Loader2 className="animate-spin text-indigo-400" size={24} />
        <span className="text-base">Loading layout simulation…</span>
      </div>
    );
  }

  if (error && !sections.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#07090f] text-slate-400 gap-4">
        <p className="text-red-400 font-semibold">{error}</p>
        <Link href="/admin" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  // Viewbox coordinates for zoom
  let viewBoxStr = `0 0 ${canvasWidth} ${canvasHeight}`;
  if (selectedSection) {
    const bbox = calculateBoundingBox(selectedSection.geometry.points ?? []);
    if (bbox.width > 0 && bbox.height > 0) {
      const padX = Math.max(50, bbox.width * 0.15);
      const padY = Math.max(50, bbox.height * 0.15);
      viewBoxStr = `${bbox.minX - padX} ${bbox.minY - padY} ${bbox.width + 2 * padX} ${bbox.height + 2 * padY}`;
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#07090f] text-white">
      {/* Top Header */}
      <header className="glass border-b border-white/[0.06] px-6 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link href={`/admin/layout-builder?layoutId=${layoutId}`} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={14} />
            Back to Geometry Builder
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="text-sm font-semibold text-white">Seat Simulator & Editor: <span className="text-indigo-400">{layoutName}</span></h1>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400 mr-2">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/10"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving Configurations…' : 'Save Seating Layout'}
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Visual Map Canvas Workspace */}
        <div
          className="flex-1 relative flex items-center justify-center p-8 transition-colors duration-500 overflow-hidden select-none"
          style={{ background: selectedSectionId ? 'radial-gradient(ellipse at center, #0c1322 0%, #070a12 100%)' : '#0a0d16' }}
        >
          {selectedSection ? (
            <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
              <div className="w-full max-w-4xl h-[72vh] flex flex-col bg-[#090d16]/30 border border-white/[0.06] rounded-2xl p-4 shadow-2xl relative select-none">
                <SeatGridPicker
                  section={selectedSection as any}
                  seats={selectedSection.seats as any}
                  selectedIds={new Set()}
                  onToggleSeat={() => { }}
                  adminMode={true}
                  disabledSeatKeys={selectedSection.geometry.disabledSeats || []}
                  onToggleDisabledSeat={(sectionId, row, number) => handleToggleSeat(sectionId, row, number)}
                  onDeleteRow={(rowLabel) => handleToggleRow(selectedSection.id, rowLabel)}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Legend indicator */}
              <div className="absolute top-4 left-4 glass px-3 py-2 border border-white/[0.06] rounded-xl text-[10px] text-slate-400 flex flex-col gap-1.5 shadow-lg z-20">
                <span className="font-semibold text-slate-200">Simulation View:</span>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-indigo-500" />
                  <span>Active Seat (Click to disable)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-dashed border-indigo-500 bg-indigo-500/15" />
                  <span>Disabled/Gap Seat (Click to restore)</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 border-t border-white/[0.04] pt-1">
                  <span>{selectedSectionId ? '🔍 Zoomed Section Mode' : '🗺️ Full Map Mode (Click section shape)'}</span>
                </div>
              </div>

              <svg
                viewBox={viewBoxStr}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full max-w-full max-h-full object-contain transition-all duration-500 ease-out"
              >
                {/* Render sections */}
                {sections.map((s) => {
                  const path = renderShapePath(s.geometry);
                  const centroid = calculateCentroid(s.geometry.points ?? []);
                  const isSelected = selectedSectionId === s.id;

                  return (
                    <g
                      key={s.id}
                      onClick={() => {
                        if (!selectedSectionId) {
                          setSelectedSectionId(s.id);
                        }
                      }}
                      className="transition-all"
                    >
                      {/* Section Label (rendered if not zoomed into another section) */}
                      {(!selectedSectionId || isSelected) && (
                        <g style={{ pointerEvents: 'none' }}>
                          <text x={centroid.x} y={centroid.y - 8} textAnchor="middle"
                            fill="#fff" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">{s.code}</text>
                          <text x={centroid.x} y={centroid.y + 8} textAnchor="middle"
                            fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="Inter, sans-serif">{s.name}</text>
                        </g>
                      )}

                      {/* Bounding shape contour with dynamic border stroke scaling */}
                      <path
                        d={path}
                        fill={s.shapeType === 'STAGE' ? '#312e81' : s.color}
                        fillOpacity={s.shapeType === 'STAGE' ? 0.85 : (selectedSectionId ? (isSelected ? 0.08 : 0.02) : 0.18)}
                        stroke={s.shapeType === 'STAGE' ? '#818cf8' : s.color}
                        strokeWidth={isSelected ? (s.rowCount * s.seatsPerRow > 90 ? 1.0 : s.rowCount * s.seatsPerRow > 40 ? 1.4 : 2.0) : 1.5}
                        strokeDasharray={selectedSectionId && !isSelected ? "3 3" : undefined}
                        style={{
                          cursor: selectedSectionId ? 'default' : 'pointer',
                          transition: 'all 0.3s ease',
                          pointerEvents: selectedSectionId ? 'none' : 'auto',
                        }}
                      />
                    </g>
                  );
                })}
              </svg>
            </>
          )}
        </div>

        {/* Right properties panel */}
        <div className="w-80 flex-shrink-0 flex flex-col glass border-l border-white/[0.06] p-4 gap-4 overflow-y-auto">
          {selectedSection ? (
            <div className="flex flex-col gap-4 h-full">
              {/* Header zoom details */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">Zoomed Section</span>
                  <span className="text-sm font-bold text-white mt-0.5">{selectedSection.name} ({selectedSection.code})</span>
                </div>
                <button
                  onClick={() => setSelectedSectionId(null)}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Back to venue map"
                >
                  <X size={14} />
                </button>
              </div>

              {selectedSection.shapeType === 'STAGE' ? (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-2.5 text-indigo-300">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Grid3X3 size={16} className="text-indigo-400" />
                    <span>Stage Landmark</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This element represents the venue stage landmark for spatial positioning. A stage contains 0 seats and possesses no price or booking attributes.
                  </p>
                </div>
              ) : (
                <>
                  {/* Base Info metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
                      <span className="text-[10px] text-slate-400 block">Row Count</span>
                      <span className="text-sm font-bold mt-0.5">{selectedSection.rowCount}</span>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
                      <span className="text-[10px] text-slate-400 block">Seats Per Row</span>
                      <span className="text-sm font-bold mt-0.5">{selectedSection.seatsPerRow}</span>
                    </div>
                  </div>

                  {/* Clip to Boundary Toggle */}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id="clipToBoundary"
                      checked={selectedSection.geometry.clipToBoundary !== false}
                      onChange={(e) => {
                        const updatedGeom = {
                          ...selectedSection.geometry,
                          clipToBoundary: e.target.checked,
                        };
                        updateSection(selectedSection.id, {
                          geometry: updatedGeom,
                        });
                      }}
                      className="w-4 h-4 rounded border-white/[0.08] bg-white/[0.06] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
                    />
                    <label htmlFor="clipToBoundary" className="text-xs text-slate-300 cursor-pointer select-none">
                      Clip seats to shape boundary
                    </label>
                  </div>

                  {/* Row configuration adjusters */}
                  <div className="border border-white/[0.08] rounded-xl p-3 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-slate-300">Adjust Seats per Row</span>
                    <div className="max-h-56 overflow-y-auto flex flex-col gap-2 pr-1">
                      {Array.from({ length: selectedSection.rowCount }).map((_, r) => {
                        const rowLabel = getRowLabel(r);
                        const rowConfigs = selectedSection.geometry.rowConfigs || [];
                        const rowConfig = rowConfigs.find((rc) => rc.row === rowLabel);
                        const currentCount = rowConfig ? rowConfig.seatCount : selectedSection.seatsPerRow;

                        const handleUpdateRowCount = (newCount: number) => {
                          const count = Math.max(1, Math.min(50, newCount));
                          let updatedConfigs = [...rowConfigs];
                          const idx = updatedConfigs.findIndex((rc) => rc.row === rowLabel);
                          if (idx >= 0) {
                            updatedConfigs[idx] = { row: rowLabel, seatCount: count };
                          } else {
                            updatedConfigs.push({ row: rowLabel, seatCount: count });
                          }
                          updateSection(selectedSection.id, {
                            geometry: {
                              ...selectedSection.geometry,
                              rowConfigs: updatedConfigs,
                            },
                          });
                        };

                        return (
                          <div key={rowLabel} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.04]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-medium">Row {rowLabel}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleRow(selectedSection.id, rowLabel)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                                title={`Toggle delete/restore full Row ${rowLabel}`}
                              >
                                Delete Row
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleUpdateRowCount(currentCount - 1)}
                                className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={currentCount}
                                onChange={(e) => handleUpdateRowCount(Number(e.target.value))}
                                className="w-10 bg-white/[0.04] text-center text-white py-0.5 rounded border border-white/[0.06] outline-none text-[10px]"
                              />
                              <button
                                onClick={() => handleUpdateRowCount(currentCount + 1)}
                                className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reset Section Customization button */}
                  {((selectedSection.geometry.rowConfigs && selectedSection.geometry.rowConfigs.length > 0) ||
                    (selectedSection.geometry.disabledSeats && selectedSection.geometry.disabledSeats.length > 0) ||
                    selectedSection.geometry.clipToBoundary === false) && (
                      <button
                        onClick={() => {
                          updateSection(selectedSection.id, {
                            geometry: {
                              ...selectedSection.geometry,
                              rowConfigs: [],
                              disabledSeats: [],
                              clipToBoundary: true,
                            },
                          });
                        }}
                        className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-xs font-semibold transition-all"
                      >
                        Reset Custom Grid
                      </button>
                    )}

                  {/* Metric indicator */}
                  <div className="bg-white/[0.04] rounded-xl px-3 py-2.5 mt-auto">
                    <p className="text-[10px] text-slate-400">Total Bookable Seats</p>
                    <p className="text-xl font-bold text-white mt-0.5">{selectedSection.seats.length}</p>
                    <p className="text-[9px] text-slate-500">Excluding disabled aisles / layout gaps</p>
                  </div>
                </>
              )}

              {/* Back to map action */}
              <button
                onClick={() => setSelectedSectionId(null)}
                className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 rounded-lg text-xs font-semibold text-indigo-300 flex items-center justify-center gap-1.5 transition-all mt-1"
              >
                Apply & Back to Venue Map
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-2 p-4">
              <Grid3X3 size={28} className="text-indigo-400 opacity-60 animate-pulse" />
              <span className="text-xs font-medium text-slate-300 mt-2">No Section Selected</span>
              <p className="text-[10px] text-slate-500">Click on any section layout shape on the map canvas simulation to zoom in and customize its seating grid.</p>
            </div>
          )}
        </div>
      </div>

      {/* Save Success Toast */}
      {savedOk && (
        <div
          data-testid="toast-notification"
          className="toast-success fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50 text-xs font-medium"
        >
          <CheckCircle size={14} />
          Seating layout configured successfully!
        </div>
      )}
    </div>
  );
}

export default function AdminLayoutBuilderSeatEditorPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-[#07090f] text-slate-400 gap-2">
        <Loader2 className="animate-spin text-indigo-400" size={24} />
        <span className="text-base">Loading seating configuration workspace…</span>
      </div>
    }>
      <SeatEditorWorkspace />
    </Suspense>
  );
}
