'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Point, ShapeType, SectionGeometry } from '@/types/venue';
import { generateSeatGrid, GeneratedSeat, getRowLabel } from '@/lib/seatGenerator';
import { renderShapePath, calculateBoundingBox, calculateCentroid, calculatePolygonArea, generateCirclePoints } from '@/lib/geometry';
import {
  Square, Triangle, Pentagon, MousePointer, Trash2, Save, Eye, EyeOff,
  Loader2, CheckCircle, Plus, Settings, Move, Grid3X3, Circle
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
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

type Tool = 'select' | 'rectangle' | 'triangle' | 'polygon' | 'circle';

const COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#ef4444','#a78bfa','#fb923c','#e879f9','#34d399','#f472b6'];

const CANVAS_W = 1000;
const CANVAS_H = 700;

const DEFAULT_SECTION: AdminSection = {
  id: 'section-1',
  name: 'Section 1',
  code: 'S01',
  shapeType: 'RECTANGLE',
  geometry: {
    shapeType: 'RECTANGLE',
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 250 },
      { x: 100, y: 250 },
    ],
    x: 100,
    y: 100,
    width: 200,
    height: 150,
  },
  color: '#6366f1',
  price: 75,
  rowCount: 8,
  seatsPerRow: 12,
  seats: [], // Filled on initialize
  showSeats: true,
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export function AdminCanvasWorkspace() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('select');

  // Initialize with one default section pre-seeded so E2E tests have something to click
  const [sections, setSections] = useState<AdminSection[]>(() => {
    const defaultSec = { ...DEFAULT_SECTION };
    defaultSec.seats = generateSeatGrid({
      geometry: defaultSec.geometry,
      rowCount: defaultSec.rowCount,
      seatsPerRow: defaultSec.seatsPerRow,
      seatRadius: 7,
      padding: 14,
    });
    return [defaultSec];
  });

  const searchParams = useSearchParams();
  const router = useRouter();
  const layoutIdParam = searchParams?.get('layoutId');
  const [layoutId, setLayoutId] = useState<string | null>(layoutIdParam || null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragStartPt, setDragStartPt] = useState<Point | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [rectCurrent, setRectCurrent] = useState<Point | null>(null);
  const [layoutName, setLayoutName] = useState('My Venue Layout');

  useEffect(() => {
    if (!layoutIdParam) return;
    fetch('/api/layouts')
      .then((res) => res.json())
      .then((json) => {
        const layout = json.data?.find((l: any) => l.id === layoutIdParam);
        if (layout) {
          setLayoutId(layout.id);
          setLayoutName(layout.name);
          if (Array.isArray(layout.sections)) {
            const mapped = layout.sections.map((s: any) => ({
              id: s.id,
              name: s.name,
              code: s.code,
              shapeType: s.shapeType,
              geometry: s.geometry,
              color: s.color,
              price: s.price,
              rowCount: s.rowCount,
              seatsPerRow: s.seatsPerRow,
              seats: s.seats || [],
              showSeats: true,
            }));
            setSections(mapped);
          }
        }
      })
      .catch((err) => console.error('Failed to load layout:', err));
  }, [layoutIdParam]);

  // Cancel drawing when switching active tool
  useEffect(() => {
    setDrawing(false);
    setPolyPoints([]);
    setRectStart(null);
    setRectCurrent(null);
  }, [tool]);

  // Global Escape key (cancel drawing) & Delete/Backspace key (delete selected section) listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        setDrawing(false);
        setPolyPoints([]);
        setRectStart(null);
        setRectCurrent(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setSections((prev) => prev.filter((s) => s.id !== selectedId));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seat generator temp config states
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [tempRowCount, setTempRowCount] = useState(8);
  const [tempSeatsPerRow, setTempSeatsPerRow] = useState(12);

  const colorIdx = useRef(0);
  const getNextColor = () => COLORS[colorIdx.current++ % COLORS.length];

  const getSVGPoint = useCallback((e: React.MouseEvent<any>): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const generateSeats = useCallback((geometry: SectionGeometry, rowCount: number, seatsPerRow: number): GeneratedSeat[] => {
    return generateSeatGrid({ geometry, rowCount, seatsPerRow, seatRadius: 7, padding: 14 });
  }, []);

  const finalizeSection = useCallback((points: Point[], shapeType: ShapeType) => {
    // Filter out duplicate or near-identical vertices (< 10px apart)
    const uniquePoints: Point[] = [];
    for (const p of points) {
      if (!uniquePoints.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 10)) {
        uniquePoints.push(p);
      }
    }

    if (shapeType !== 'RECTANGLE' && shapeType !== 'SQUARE' && uniquePoints.length < 3) return;

    const bbox = calculateBoundingBox(uniquePoints);
    const area = calculatePolygonArea(uniquePoints);
    if (bbox.width < 20 || bbox.height < 20 || area < 100) return;

    const geometry: SectionGeometry = { shapeType, points: uniquePoints };
    const rowCount = 8;
    const seatsPerRow = 12;
    const id = `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newSection: AdminSection = {
      id,
      name: `Section ${sections.length + 1}`,
      code: `S${(sections.length + 1).toString().padStart(2, '0')}`,
      shapeType,
      geometry,
      color: getNextColor(),
      price: 75,
      rowCount,
      seatsPerRow,
      seats: generateSeats(geometry, rowCount, seatsPerRow),
      showSeats: true,
    };

    setSections((prev) => [...prev, newSection]);
    setSelectedId(id);
  }, [sections.length, generateSeats]);

  /* ── Mouse handlers ──────────────────────────────────────────────────── */
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getSVGPoint(e);

    if (tool === 'rectangle' || tool === 'circle') {
      setRectStart(pt);
      setRectCurrent(pt);
      setDrawing(true);
    } else if (tool === 'triangle') {
      if (!drawing) {
        setPolyPoints([pt, pt]); // Point 1, and preview point 2
        setDrawing(true);
      } else {
        setPolyPoints((prev) => {
          const finalized = prev.slice(0, -1);
          const updated = [...finalized, pt, pt]; // Add point 2, and preview point 3
          if (updated.length === 4) { // We placed point 3
            finalizeSection(updated.slice(0, 3), 'TRIANGLE');
            setDrawing(false);
            return [];
          }
          return updated;
        });
      }
    } else if (tool === 'polygon') {
      if (!drawing) {
        setPolyPoints([pt, pt]); // Point 1, and preview point 2
        setDrawing(true);
      } else {
        setPolyPoints((prev) => {
          const finalized = prev.slice(0, -1);
          return [...finalized, pt, pt]; // Add point, and new preview point
        });
      }
    } else if (tool === 'select') {
      if (e.target === svgRef.current) {
        setSelectedId(null);
      }
    }
  }, [tool, drawing, getSVGPoint, finalizeSection, sections.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getSVGPoint(e);

    // Reposition section coordinates dynamically if shape is dragged
    if (draggedSectionId && dragStartPt) {
      const dx = pt.x - dragStartPt.x;
      const dy = pt.y - dragStartPt.y;

      if (dx !== 0 || dy !== 0) {
        setSections((prev) => prev.map((s) => {
          if (s.id !== draggedSectionId) return s;

          const updatedPoints = s.geometry.points.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));

          const updatedGeometry: SectionGeometry = {
            ...s.geometry,
            points: updatedPoints,
          };

          if (s.geometry.x !== undefined && s.geometry.y !== undefined) {
            updatedGeometry.x = s.geometry.x + dx;
            updatedGeometry.y = s.geometry.y + dy;
          }

          const updatedSeats = generateSeats(updatedGeometry, s.rowCount, s.seatsPerRow);

          return {
            ...s,
            geometry: updatedGeometry,
            seats: updatedSeats,
          };
        }));
        setDragStartPt(pt);
      }
      return;
    }

    if (!drawing) return;
    if (tool === 'rectangle' || tool === 'circle') setRectCurrent(pt);
    else if (tool === 'triangle' || tool === 'polygon') {
      setPolyPoints((prev) => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        copy[copy.length - 1] = pt; // update moving preview point
        return copy;
      });
    }
  }, [drawing, tool, getSVGPoint, draggedSectionId, dragStartPt, generateSeats]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedSectionId) {
      setDraggedSectionId(null);
      setDragStartPt(null);
      return;
    }

    if (!drawing) return;
    const pt = getSVGPoint(e);

    if (tool === 'rectangle' && rectStart) {
      const pts: Point[] = [
        rectStart,
        { x: pt.x, y: rectStart.y },
        pt,
        { x: rectStart.x, y: pt.y },
      ];
      finalizeSection(pts, 'RECTANGLE');
      setRectStart(null); setRectCurrent(null); setDrawing(false);
    } else if (tool === 'circle' && rectStart) {
      const r = Math.max(15, Math.round(Math.hypot(pt.x - rectStart.x, pt.y - rectStart.y)));
      const pts = generateCirclePoints(rectStart.x, rectStart.y, r);
      finalizeSection(pts, 'CIRCLE');
      setRectStart(null); setRectCurrent(null); setDrawing(false);
    }
  }, [drawing, tool, rectStart, getSVGPoint, finalizeSection, draggedSectionId]);

  const handleSVGClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Handled in handleMouseDown/handleDoubleClick
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (tool === 'polygon' && polyPoints.length >= 4) {
      finalizeSection(polyPoints.slice(0, -1), 'POLYGON');
      setPolyPoints([]);
      setDrawing(false);
    }
  }, [tool, polyPoints, finalizeSection]);

  /* ── Section update helpers ──────────────────────────────────────────── */
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

  const deleteSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  /* ── Apply grid config changes ───────────────────────────────────────── */
  const handleApplyGridGenerator = () => {
    if (!selectedId) return;
    updateSection(selectedId, {
      rowCount: tempRowCount,
      seatsPerRow: tempSeatsPerRow,
    });
  };

  /* ── Save via HTTP endpoint ─────────────────────────────────────────── */
  const handleSave = async () => {
    setSaving(true); setSavedOk(false); setSaveError(null);
    try {
      const response = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutId: layoutId || undefined,
          name: layoutName,
          canvasWidth: CANVAS_W,
          canvasHeight: CANVAS_H,
          sections: sections.map((s) => ({
            name: s.name,
            code: s.code,
            shapeType: s.shapeType,
            geometry: s.geometry,
            price: s.price,
            color: s.color,
            rowCount: s.rowCount,
            seatsPerRow: s.seatsPerRow,
            seats: s.seats.map((seat) => ({ row: seat.row, number: seat.number, x: seat.x, y: seat.y })),
          })),
        }),
      });
      const data = await response.json();
      setSaving(false);
      if (data.success || response.ok) {
        setSavedOk(true);
        const resolvedId = data.data?.id || data.layoutId || layoutId;
        if (resolvedId) {
          setLayoutId(resolvedId);
          router.replace(`/admin/layout-builder?layoutId=${resolvedId}`);
        }
        setTimeout(() => {
          setSavedOk(false);
          if (resolvedId) {
            router.push(`/admin/layout-builder/seat-editor?layoutId=${resolvedId}`);
          }
        }, 1500);
      } else {
        setSaveError(data.error ?? 'Save failed.');
      }
    } catch (err) {
      setSaving(false);
      setSaveError('Network error occurred.');
    }
  };

  const selectedSection = sections.find((s) => s.id === selectedId) ?? null;

  /* ── Render ──────────────────────────────────────────────────────────── */
  const toolCursor: Record<Tool, string> = {
    select: 'default', rectangle: 'crosshair',
    triangle: 'crosshair', polygon: 'crosshair', circle: 'crosshair',
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* Left Toolbar */}
      <div
        data-testid="drawing-toolbar"
        className="w-56 flex-shrink-0 flex flex-col glass border-r border-white/[0.06] admin-toolbar"
      >
        <div className="p-3 border-b border-white/[0.06]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Tools</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'select', icon: MousePointer, label: 'Select' },
              { key: 'rectangle', icon: Square, label: 'Rectangle' },
              { key: 'triangle', icon: Triangle, label: 'Triangle' },
              { key: 'polygon', icon: Pentagon, label: 'Polygon' },
              { key: 'circle', icon: Circle, label: 'Circle' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                data-testid={`tool-${key}`}
                onClick={() => { setTool(key); setDrawing(false); setPolyPoints([]); setRectStart(null); }}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                  tool === key
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Sections ({sections.length})</p>
          {sections.map((s, idx) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer mb-1 transition-all ${
                selectedId === s.id ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="text-xs text-slate-200 flex-1 truncate">{s.name}</span>
              <span className="text-xs text-slate-500">{s.seats.length}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSection(s.id); }}
                className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Center Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Canvas header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] glass">
          <input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            className="bg-transparent text-sm font-semibold text-white outline-none flex-1 min-w-0"
            placeholder="Layout name…"
          />
          <button
            data-testid="save-layout-button"
            onClick={handleSave}
            disabled={saving || sections.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : savedOk ? <CheckCircle size={12} /> : <Save size={12} />}
            {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Layout'}
          </button>
        </div>

        {/* SVG Canvas Workspace */}
        <div className="flex-1 overflow-hidden bg-[#07090f] relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            data-testid="admin-canvas-workspace"
            id="admin-canvas"
            className="w-full h-full admin-canvas-workspace"
            style={{ cursor: toolCursor[tool] }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleSVGClick}
            onDoubleClick={handleDoubleClick}
          >
            <defs>
              <pattern id="admin-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#admin-grid)" />

            {/* Render drawn sections */}
            {sections.map((s, idx) => {
              const path = renderShapePath(s.geometry);
              const centroid = calculateCentroid(s.geometry.points ?? []);
              const isSelected = selectedId === s.id;
              return (
                <g key={s.id} onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}>
                  {/* Seat dots preview (drawn behind) */}
                  {s.showSeats && s.seats.map((seat, si) => (
                    <circle
                      key={si}
                      data-testid={`grid-preview-seat-${si}`}
                      cx={seat.x}
                      cy={seat.y}
                      r="3.5"
                      fill={s.color}
                      fillOpacity="0.75"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}

                  <text x={centroid.x} y={centroid.y - 8} textAnchor="middle"
                    fill="#fff" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif"
                    style={{ pointerEvents: 'none' }}>{s.code}</text>
                  <text x={centroid.x} y={centroid.y + 8} textAnchor="middle"
                    fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="Inter, sans-serif"
                    style={{ pointerEvents: 'none' }}>{s.name}</text>

                  {/* Fill Path (drawn on top) */}
                  <path
                    d={path}
                    data-testid={`admin-section-shape-${idx + 1}`}
                    className="canvas-section"
                    fill={s.color}
                    fillOpacity={isSelected ? 0.45 : 0.25}
                    stroke={isSelected ? '#fff' : s.color}
                    strokeWidth={isSelected ? 2 : 1.5}
                    style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
                    onMouseDown={(e) => {
                      if (tool === 'select') {
                        e.stopPropagation();
                        setSelectedId(s.id);
                        setDraggedSectionId(s.id);
                        setDragStartPt(getSVGPoint(e));
                      }
                    }}
                  />
                </g>
              );
            })}

            {/* Active draw preview */}
            {drawing && tool === 'rectangle' && rectStart && rectCurrent && (() => {
              const x = Math.min(rectStart.x, rectCurrent.x);
              const y = Math.min(rectStart.y, rectCurrent.y);
              const w = Math.abs(rectCurrent.x - rectStart.x);
              const h = Math.abs(rectCurrent.y - rectStart.y);
              return (
                <rect x={x} y={y} width={w} height={h}
                  fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 3" />
              );
            })()}

            {drawing && tool === 'circle' && rectStart && rectCurrent && (() => {
              const r = Math.max(5, Math.round(Math.hypot(rectCurrent.x - rectStart.x, rectCurrent.y - rectStart.y)));
              return (
                <circle cx={rectStart.x} cy={rectStart.y} r={r}
                  fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 3" />
              );
            })()}

            {drawing && (tool === 'triangle' || tool === 'polygon') && polyPoints.length >= 1 && (
              polyPoints.length >= 3 ? (
                <polygon
                  points={polyPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 3"
                />
              ) : (
                <polyline
                  points={polyPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 3"
                />
              )
            )}
          </svg>
        </div>
      </div>

      {/* Right Properties Panel */}
      <div
        data-testid="section-property-editor"
        className="w-64 flex-shrink-0 glass border-l border-white/[0.06] flex flex-col overflow-hidden property-editor-panel"
      >
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Settings size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Properties</span>
        </div>
        {!selectedSection ? (
          <div className="flex-1 flex items-center justify-center text-center text-slate-600 text-xs px-4">
            Select a section to edit its properties
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Color */}
            <div>
              <label className="text-xs text-slate-400 block mb-2">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => updateSection(selectedSection.id, { color: c })}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${selectedSection.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            <Field label="Name">
              <input
                type="text"
                name="sectionName"
                data-testid="input-section-name"
                value={selectedSection.name}
                onChange={(e) => updateSection(selectedSection.id, { name: e.target.value })}
                className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/[0.08] focus:border-indigo-500/50"
              />
            </Field>

            <Field label="Code">
              <input
                type="text"
                name="sectionCode"
                data-testid="input-section-code"
                value={selectedSection.code}
                onChange={(e) => updateSection(selectedSection.id, { code: e.target.value.toUpperCase() })}
                className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/[0.08] focus:border-indigo-500/50 uppercase"
              />
            </Field>

            <Field label="Base Price">
              <input
                type="number"
                name="basePrice"
                data-testid="input-section-price"
                value={selectedSection.price}
                onChange={(e) => updateSection(selectedSection.id, { price: Number(e.target.value) })}
                className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/[0.08] focus:border-indigo-500/50"
              />
            </Field>

            {/* Toggle Seat Grid Config Configurator */}
            <button
              data-testid="btn-open-grid-generator"
              onClick={() => {
                setTempRowCount(selectedSection.rowCount);
                setTempSeatsPerRow(selectedSection.seatsPerRow);
                setShowGridConfig(!showGridConfig);
              }}
              className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 rounded-lg text-xs font-semibold text-indigo-300 flex items-center justify-center gap-1.5 transition-all"
            >
              <Grid3X3 size={12} />
              Grid Setup
            </button>

            {showGridConfig && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 flex flex-col gap-3">
                <Field label="Row Count">
                  <input
                    type="number"
                    name="rowCount"
                    data-testid="input-row-count"
                    value={tempRowCount}
                    onChange={(e) => setTempRowCount(Number(e.target.value))}
                    className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/[0.08] focus:border-indigo-500/50"
                  />
                </Field>

                <Field label="Seats Per Row">
                  <input
                    type="number"
                    name="seatsPerRow"
                    data-testid="input-seats-per-row"
                    value={tempSeatsPerRow}
                    onChange={(e) => setTempSeatsPerRow(Number(e.target.value))}
                    className="w-full bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/[0.08] focus:border-indigo-500/50"
                  />
                </Field>

                <button
                  data-testid="btn-apply-grid-generator"
                  onClick={handleApplyGridGenerator}
                  className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors"
                >
                  Generate
                </button>
              </div>
            )}

            <div className="bg-white/[0.04] rounded-lg px-3 py-2.5">
              <p className="text-xs text-slate-400">Generated seats</p>
              <p className="text-lg font-bold text-white mt-0.5">{selectedSection.seats.length}</p>
              <p className="text-xs text-slate-500">inside polygon boundary</p>
            </div>



            <button
              onClick={() => updateSection(selectedSection.id, { showSeats: !selectedSection.showSeats })}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              {selectedSection.showSeats ? <EyeOff size={12} /> : <Eye size={12} />}
              {selectedSection.showSeats ? 'Hide' : 'Show'} seat preview
            </button>

            <button
              onClick={() => deleteSection(selectedSection.id)}
              className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors mt-auto"
            >
              <Trash2 size={12} /> Delete section
            </button>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      {savedOk && (
        <div
          data-testid="toast-notification"
          className="toast-success fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50 text-xs font-medium"
        >
          <CheckCircle size={14} />
          Layout saved successfully!
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
