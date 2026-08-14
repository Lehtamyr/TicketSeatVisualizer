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
  tierId?: string;
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
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
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
        if (data.pricingTiers && data.pricingTiers.length > 0) {
          setPricingTiers(data.pricingTiers);
        }

        const mapped = (data.sections || []).map((s: any) => {
          let geom = s.geometry;
          if (typeof geom === 'string') {
            try { geom = JSON.parse(geom); } catch { }
          }
          if (geom && typeof geom === 'object') {
            geom = { ...geom, clipToBoundary: geom.clipToBoundary === true };
          }
          const isStage = s.shapeType === 'STAGE' || geom?.shapeType === 'STAGE';
          return {
            id: s.id,
            tierId: isStage ? undefined : (s.pricingTierId || s.tierId || undefined),
            name: s.name,
            code: s.code,
            shapeType: isStage ? 'STAGE' : s.shapeType,
            geometry: geom,
            color: s.color || '#3B82F6',
            price: isStage ? 0 : (s.price || 50),
            rowCount: isStage ? 0 : (s.rowCount || 8),
            seatsPerRow: isStage ? 0 : (s.seatsPerRow || 12),
            seats: isStage ? [] : (s.seats || []),
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
          pricingTiers,
          sections: sections.map((s) => {
            const isStage = s.shapeType === 'STAGE';
            return {
              name: s.name,
              code: s.code,
              shapeType: s.shapeType,
              geometry: { ...s.geometry, clipToBoundary: false },
              price: isStage ? 0 : s.price,
              color: s.color,
              rowCount: isStage ? 0 : s.rowCount,
              seatsPerRow: isStage ? 0 : s.seatsPerRow,
              tierId: isStage ? undefined : (s.tierId || undefined),
              seats: isStage ? [] : s.seats.map((seat) => ({ row: seat.row, number: seat.number, x: seat.x, y: seat.y })),
            };
          }),
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
      <div className="h-screen flex items-center justify-center bg-primary text-secondary gap-2">
        <Loader2 className="animate-spin text-accent" size={24} />
        <span className="text-base">Loading layout simulation…</span>
      </div>
    );
  }

  if (error && !sections.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-primary text-secondary gap-4">
        <p className="text-accent font-semibold">{error}</p>
        <Link href="/admin" className="px-4 py-2 bg-accent hover:bg-accent-hover text-primary rounded-lg text-sm">
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
    <div className="flex flex-col h-screen bg-primary text-primary">
      {/* Top Header */}
      <header className="glass border-b border-subtle px-6 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link href={`/admin/layout-builder?layoutId=${layoutId}`} className="flex items-center gap-1.5 text-secondary hover:text-primary transition-colors text-sm">
            <ArrowLeft size={14} />
            Back to Geometry Builder
          </Link>
          <div className="h-4 w-px hover:bg-accent hover:text-white" />
          <h1 className="text-sm font-semibold text-primary">Seat Simulator & Editor: <span className="text-accent">{layoutName}</span></h1>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-accent mr-2">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-card disabled:text-muted rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-none"
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
          style={{ background: "var(--bg-primary)" }}
        >
          {selectedSection ? (
            <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
              <div className="w-full max-w-4xl h-[72vh] flex flex-col bg-[#090d16]/30 border border-subtle rounded-2xl p-4 shadow-2xl relative select-none">
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
              <div className="absolute top-4 left-4 glass px-3 py-2 border border-subtle rounded-xl text-[10px] text-secondary flex flex-col gap-1.5 shadow-lg z-20">
                <span className="font-semibold text-secondary">Simulation View:</span>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-accent" />
                  <span>Active Seat (Click to disable)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-dashed border-accent bg-accent/15" />
                  <span>Disabled/Gap Seat (Click to restore)</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 border-t border-subtle pt-1">
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
                            fill="var(--text-primary)" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">{s.code}</text>
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
        <div className="w-80 flex-shrink-0 flex flex-col glass border-l border-subtle p-4 gap-4 overflow-y-auto">
          {selectedSection ? (
            <div className="flex flex-col gap-4 h-full">
              {/* Header zoom details */}
              <div className="flex items-center justify-between border-b border-subtle pb-3">
                <div className="flex flex-col">
                  <span className="text-xs text-secondary">Zoomed Section</span>
                  <span className="text-sm font-bold text-primary mt-0.5">{selectedSection.name} ({selectedSection.code})</span>
                </div>
                <button
                  onClick={() => setSelectedSectionId(null)}
                  className="p-1.5 bg-secondary hover:bg-accent hover:text-white rounded-lg text-secondary hover:text-primary transition-colors"
                  title="Back to venue map"
                >
                  <X size={14} />
                </button>
              </div>

              {selectedSection.shapeType === 'STAGE' ? (
                <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex flex-col gap-2.5 text-accent">
                  <div className="flex items-center gap-2 font-semibold text-primary">
                    <Grid3X3 size={16} className="text-accent" />
                    <span>Stage Landmark</span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    This element represents the venue stage landmark for spatial positioning. A stage contains 0 seats and possesses no price or booking attributes.
                  </p>
                </div>
              ) : (
                <>
                  {/* Base Info metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-secondary rounded-xl p-3 border border-subtle">
                      <span className="text-[10px] text-secondary block">Row Count</span>
                      <span className="text-sm font-bold mt-0.5">{selectedSection.rowCount}</span>
                    </div>
                    <div className="bg-secondary rounded-xl p-3 border border-subtle">
                      <span className="text-[10px] text-secondary block">Seats Per Row</span>
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
                      className="w-4 h-4 rounded border-default bg-secondary text-accent focus:ring-accent/50 cursor-pointer"
                    />
                    <label htmlFor="clipToBoundary" className="text-xs text-secondary cursor-pointer select-none">
                      Clip seats to shape boundary
                    </label>
                  </div>

                  {/* Row configuration adjusters */}
                  <div className="border border-default rounded-xl p-3 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-secondary">Adjust Seats per Row</span>
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
                          <div key={rowLabel} className="flex items-center justify-between text-xs py-1 border-b border-subtle">
                            <div className="flex items-center gap-1.5">
                              <span className="text-secondary font-medium">Row {rowLabel}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleRow(selectedSection.id, rowLabel)}
                                className="text-[10px] px-1.5 py-0.5 rounded glass hover:bg-accent hover:text-white text-accent border border-accent/20 transition-colors"
                                title={`Toggle delete/restore full Row ${rowLabel}`}
                              >
                                Delete Row
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleUpdateRowCount(currentCount - 1)}
                                className="w-5 h-5 rounded bg-secondary hover:bg-accent hover:text-white flex items-center justify-center text-secondary transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={currentCount}
                                onChange={(e) => handleUpdateRowCount(Number(e.target.value))}
                                className="w-10 bg-secondary text-center text-primary py-0.5 rounded border border-subtle outline-none text-[10px]"
                              />
                              <button
                                onClick={() => handleUpdateRowCount(currentCount + 1)}
                                className="w-5 h-5 rounded bg-secondary hover:bg-accent hover:text-white flex items-center justify-center text-secondary transition-colors"
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
                        className="w-full py-1.5 glass hover:bg-accent hover:text-white border border-accent/20 text-accent rounded-lg text-xs font-semibold transition-all"
                      >
                        Reset Custom Grid
                      </button>
                    )}

                  {/* Metric indicator */}
                  <div className="bg-secondary rounded-xl px-3 py-2.5 mt-auto">
                    <p className="text-[10px] text-secondary">Total Bookable Seats</p>
                    <p className="text-xl font-bold text-primary mt-0.5">{selectedSection.seats.length}</p>
                    <p className="text-[9px] text-muted">Excluding disabled aisles / layout gaps</p>
                  </div>
                </>
              )}

              {/* Back to map action */}
              <button
                onClick={() => setSelectedSectionId(null)}
                className="w-full py-2 glass hover:bg-accent hover:text-white border border-accent/20 rounded-lg text-xs font-semibold text-accent flex items-center justify-center gap-1.5 transition-all mt-1"
              >
                Apply & Back to Venue Map
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-secondary text-center gap-2 p-4">
              <Grid3X3 size={28} className="text-accent opacity-60 animate-pulse" />
              <span className="text-xs font-medium text-secondary mt-2">No Section Selected</span>
              <p className="text-[10px] text-muted">Click on any section layout shape on the map canvas simulation to zoom in and customize its seating grid.</p>
            </div>
          )}
        </div>
      </div>

      {/* Save Success Toast */}
      {savedOk && (
        <div
          data-testid="toast-notification"
          className="toast-success fixed bottom-4 right-4 bg-accent text-primary px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50 text-xs font-medium"
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
      <div className="h-screen flex items-center justify-center bg-primary text-secondary gap-2">
        <Loader2 className="animate-spin text-accent" size={24} />
        <span className="text-base">Loading seating configuration workspace…</span>
      </div>
    }>
      <SeatEditorWorkspace />
    </Suspense>
  );
}
