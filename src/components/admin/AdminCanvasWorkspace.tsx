'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Point, ShapeType, SectionGeometry } from '@/types/venue';
import { generateSeatGrid, GeneratedSeat, getRowLabel } from '@/lib/seatGenerator';
import { renderShapePath, calculateBoundingBox, calculateCentroid, calculatePolygonArea, generateCirclePoints } from '@/lib/geometry';
import {
  Square, Triangle, Pentagon, MousePointer, Trash2, Save, Eye, EyeOff,
  Loader2, CheckCircle, Plus, Settings, Move, Grid3X3, Circle, X
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface TierDTO { id: string; name: string; color: string; basePrice: number; description?: string; salesEndDate?: string; }

interface AdminSection {
  id: string;
  tierId?: string;
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

type Tool = 'select' | 'rectangle' | 'triangle' | 'polygon' | 'circle' | 'stage';

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

const CANVAS_W = 1000;
const CANVAS_H = 700;

const DEFAULT_TIERS: TierDTO[] = [
  { id: 'tier-vip', name: 'VIP', color: '#f59e0b', basePrice: 2000000, description: 'VIP Seating with exclusive access.', salesEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'tier-gold', name: 'Gold', color: '#eab308', basePrice: 1500000, description: 'Premium seating with great views.', salesEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'tier-silver', name: 'Silver', color: '#94a3b8', basePrice: 1000000, description: 'Standard seating area.', salesEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'tier-bronze', name: 'Bronze', color: '#fb923c', basePrice: 500000, description: 'Economy seating.', salesEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
];

const DEFAULT_SECTION: AdminSection = {
  id: 'section-1',
  name: 'Section 1',
  code: 'S01',
  shapeType: 'RECTANGLE',
  geometry: {
    shapeType: 'RECTANGLE',
    clipToBoundary: true,
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
  showSeats: false, // ponytail: default off as requested
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export function AdminCanvasWorkspace() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [pricingTiers, setPricingTiers] = useState<TierDTO[]>(DEFAULT_TIERS);
  const [showTierManager, setShowTierManager] = useState(false);
  const [selectedEditTierId, setSelectedEditTierId] = useState<string | null>(null);

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
  const [resizingHandle, setResizingHandle] = useState<{ sectionId: string; handle: 'tl' | 'tr' | 'bl' | 'br' } | null>(null);
  const [layoutName, setLayoutName] = useState('My Venue Layout');
  const [snapToGrid, setSnapToGrid] = useState(true);

  useEffect(() => {
    if (!layoutIdParam) return;
    fetch('/api/layouts')
      .then((res) => res.json())
      .then((json) => {
        const layout = json.data?.find((l: any) => l.id === layoutIdParam);
        if (layout) {
          setLayoutId(layout.id);
          setLayoutName(layout.name);
          if (layout.pricingTiers && layout.pricingTiers.length > 0) {
            setPricingTiers(layout.pricingTiers);
          }
          if (Array.isArray(layout.sections)) {
            const mapped = layout.sections.map((s: any) => {
              const geomObj = typeof s.geometry === 'string' ? (() => { try { return JSON.parse(s.geometry); } catch { return {}; } })() : s.geometry;
              const isStageShape = s.shapeType === 'STAGE' || geomObj?.shapeType === 'STAGE';
              return {
                id: s.id,
                tierId: s.pricingTierId || undefined,
                name: s.name,
                code: s.code,
                shapeType: isStageShape ? 'STAGE' : s.shapeType,
                geometry: { ...geomObj, shapeType: isStageShape ? 'STAGE' : (geomObj?.shapeType || s.shapeType) },
                color: isStageShape ? '#312e81' : s.color,
                price: isStageShape ? 0 : s.price,
                rowCount: isStageShape ? 0 : s.rowCount,
                seatsPerRow: isStageShape ? 0 : s.seatsPerRow,
                seats: isStageShape ? [] : (s.seats || []),
                showSeats: false, // ponytail: default off as requested
              };
            });
            setSections(mapped);
          }
        }
      })
      .catch((err) => console.error('Failed to load layout:', err));
  }, [layoutIdParam]);

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

  // Global window mouseup listener to guarantee drag & resize states release anywhere on screen
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setDraggedSectionId(null);
      setDragStartPt(null);
      setResizingHandle(null);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seat generator temp config states
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [tempRowCount, setTempRowCount] = useState(8);
  const [tempSeatsPerRow, setTempSeatsPerRow] = useState(12);

  const colorIdx = useRef(0);
  const getNextColor = useCallback(() => COLORS[colorIdx.current++ % COLORS.length], []);

  const getSVGPoint = useCallback((e: React.MouseEvent<any>): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;

    if (snapToGrid) {
      return {
        x: Math.round(rawX / 20) * 20,
        y: Math.round(rawY / 20) * 20,
      };
    }

    return {
      x: Math.round(rawX),
      y: Math.round(rawY),
    };
  }, [snapToGrid]);

  const generateSeats = useCallback((geometry: SectionGeometry, rowCount: number, seatsPerRow: number): GeneratedSeat[] => {
    return generateSeatGrid({ geometry: { ...geometry, disabledSeats: [] }, rowCount, seatsPerRow, seatRadius: 7, padding: 14 });
  }, []);

  const lastFinalizedTimeRef = useRef<number>(0);

  // Use functional state updates for section creation
  const finalizeSection = useCallback((points: Point[], shapeType: ShapeType) => {
    lastFinalizedTimeRef.current = Date.now();
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

    const geometry: SectionGeometry = { shapeType, points: uniquePoints, clipToBoundary: true };
    const rowCount = 5;
    const seatsPerRow = 5;
    const id = `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setSections((prev) => {
      const count = prev.length + 1;
      const isStage = shapeType === 'STAGE';
      const newSection: AdminSection = {
        id,
        name: isStage ? 'Main Stage' : `Section ${count}`,
        code: isStage ? 'STAGE' : `S${count.toString().padStart(2, '0')}`,
        shapeType,
        geometry,
        color: isStage ? '#4f46e5' : getNextColor(),
        price: isStage ? 0 : 75,
        rowCount: isStage ? 0 : rowCount,
        seatsPerRow: isStage ? 0 : seatsPerRow,
        seats: isStage ? [] : generateSeats(geometry, rowCount, seatsPerRow),
        showSeats: false, // ponytail: default off as requested
      };
      return [...prev, newSection];
    });
    setSelectedId(id);
  }, [generateSeats, getNextColor]);

  /* ── Mouse handlers ──────────────────────────────────────────────────── */
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (Date.now() - lastFinalizedTimeRef.current < 350) return;
    const pt = getSVGPoint(e);

    if (tool === 'rectangle' || tool === 'circle' || tool === 'stage') {
      setRectStart(pt);
      setRectCurrent(pt);
      setDrawing(true);
    } else if (tool === 'triangle') {
      if (!drawing) {
        setPolyPoints([pt, pt]); // Point 1, and preview point 2
        setDrawing(true);
      } else if (polyPoints.length === 2) {
        setPolyPoints([polyPoints[0], pt, pt]); // Point 2 placed, and preview point 3
      } else if (polyPoints.length >= 3) {
        // Point 3 placed -> finalize triangle
        const pts: Point[] = [polyPoints[0], polyPoints[1], pt];
        finalizeSection(pts, 'TRIANGLE');
        setPolyPoints([]);
        setDrawing(false);
        setTool('select');
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
  }, [tool, drawing, polyPoints, getSVGPoint, finalizeSection]);

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

    if (resizingHandle) {
      const pt = getSVGPoint(e);
      const { sectionId, handle } = resizingHandle;
      setSections((prev) => prev.map((s) => {
        if (s.id !== sectionId) return s;
        const pts = s.geometry.points ?? [];
        if (pts.length === 0) return s;
        const minX = Math.min(...pts.map((p) => p.x));
        const maxX = Math.max(...pts.map((p) => p.x));
        const minY = Math.min(...pts.map((p) => p.y));
        const maxY = Math.max(...pts.map((p) => p.y));

        let newMinX = minX, newMaxX = maxX, newMinY = minY, newMaxY = maxY;
        if (handle === 'br') { newMaxX = Math.max(minX + 20, pt.x); newMaxY = Math.max(minY + 20, pt.y); }
        else if (handle === 'tr') { newMaxX = Math.max(minX + 20, pt.x); newMinY = Math.min(maxY - 20, pt.y); }
        else if (handle === 'bl') { newMinX = Math.min(maxX - 20, pt.x); newMaxY = Math.max(minY + 20, pt.y); }
        else if (handle === 'tl') { newMinX = Math.min(maxX - 20, pt.x); newMinY = Math.min(maxY - 20, pt.y); }

        const scaleX = (newMaxX - newMinX) / Math.max(10, maxX - minX);
        const scaleY = (newMaxY - newMinY) / Math.max(10, maxY - minY);
        const originX = (handle === 'tl' || handle === 'bl') ? maxX : minX;
        const originY = (handle === 'tl' || handle === 'tr') ? maxY : minY;

        const newPts = pts.map((p) => ({
          x: Math.round(originX + (p.x - originX) * scaleX),
          y: Math.round(originY + (p.y - originY) * scaleY),
        }));

        const updatedGeometry: SectionGeometry = {
          ...s.geometry,
          points: newPts,
          x: Math.min(...newPts.map((p) => p.x)),
          y: Math.min(...newPts.map((p) => p.y)),
          width: newMaxX - newMinX,
          height: newMaxY - newMinY,
        };

        return {
          ...s,
          geometry: updatedGeometry,
          seats: generateSeats(updatedGeometry, s.rowCount, s.seatsPerRow),
        };
      }));
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
  }, [drawing, tool, getSVGPoint, draggedSectionId, dragStartPt, resizingHandle, generateSeats]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (resizingHandle) {
      setResizingHandle(null);
      return;
    }

    if (draggedSectionId) {
      setDraggedSectionId(null);
      setDragStartPt(null);
      return;
    }

    if (!drawing) return;
    const pt = getSVGPoint(e);

    if ((tool === 'rectangle' || tool === 'stage') && rectStart) {
      const pts: Point[] = [
        rectStart,
        { x: pt.x, y: rectStart.y },
        pt,
        { x: rectStart.x, y: pt.y },
      ];
      finalizeSection(pts, tool === 'stage' ? 'STAGE' : 'RECTANGLE');
      setRectStart(null); setRectCurrent(null); setDrawing(false); setTool('select');
    } else if (tool === 'circle' && rectStart) {
      const r = Math.max(15, Math.round(Math.hypot(pt.x - rectStart.x, pt.y - rectStart.y)));
      const pts = generateCirclePoints(rectStart.x, rectStart.y, r);
      finalizeSection(pts, 'CIRCLE');
      setRectStart(null); setRectCurrent(null); setDrawing(false); setTool('select');
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
      setTool('select');
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

  /* ── Shape size helper ────────────────────────────────────────────────── */
  const resizeSectionShape = useCallback((id: string, targetW: number, targetH: number) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const pts = s.geometry.points ?? [];
      if (pts.length === 0) return s;
      const centroid = calculateCentroid(pts);
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const currW = Math.max(10, maxX - minX);
      const currH = Math.max(10, maxY - minY);
      const scaleX = targetW / currW;
      const scaleY = targetH / currH;

      const newPts = pts.map((p) => ({
        x: Math.round(centroid.x + (p.x - centroid.x) * scaleX),
        y: Math.round(centroid.y + (p.y - centroid.y) * scaleY),
      }));

      const updatedGeometry: SectionGeometry = {
        ...s.geometry,
        points: newPts,
        x: Math.min(...newPts.map((p) => p.x)),
        y: Math.min(...newPts.map((p) => p.y)),
        width: targetW,
        height: targetH,
      };

      return {
        ...s,
        geometry: updatedGeometry,
        seats: generateSeats(updatedGeometry, s.rowCount, s.seatsPerRow),
      };
    }));
  }, [generateSeats]);

  const hasStage = sections.some((s) => s.shapeType === 'STAGE' || s.geometry?.shapeType === 'STAGE');

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
            geometry: { ...s.geometry, clipToBoundary: false },
            price: s.price,
            color: s.color,
            rowCount: s.rowCount,
            seatsPerRow: s.seatsPerRow,
            seats: s.seats.map((seat) => ({ row: seat.row, number: seat.number, x: seat.x, y: seat.y })),
          })),
          pricingTiers,
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

  const selectedSection = sections.find((s) => s.id === selectedId);
  const selectedPts = selectedSection?.geometry.points ?? [];
  const selectedBbox = {
    width: selectedPts.length > 0 ? Math.max(...selectedPts.map((p) => p.x)) - Math.min(...selectedPts.map((p) => p.x)) : 0,
    height: selectedPts.length > 0 ? Math.max(...selectedPts.map((p) => p.y)) - Math.min(...selectedPts.map((p) => p.y)) : 0,
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  const toolCursor: Record<Tool, string> = {
    select: 'default', rectangle: 'crosshair',
    triangle: 'crosshair', polygon: 'crosshair', circle: 'crosshair', stage: 'crosshair',
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* Left Toolbar */}
      <div
        data-testid="drawing-toolbar"
        className="w-56 flex-shrink-0 flex flex-col glass border-r border-subtle admin-toolbar"
      >
        <div className="p-3 border-b border-subtle">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Tools</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'select', icon: MousePointer, label: 'Select' },
              { key: 'rectangle', icon: Square, label: 'Rectangle' },
              { key: 'triangle', icon: Triangle, label: 'Triangle' },
              { key: 'polygon', icon: Pentagon, label: 'Polygon' },
              { key: 'circle', icon: Circle, label: 'Circle' },
              { key: 'stage', icon: Grid3X3, label: 'Stage 🎭' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                data-testid={`tool-${key}`}
                onClick={() => { setTool(key); setDrawing(false); setPolyPoints([]); setRectStart(null); }}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-all ${tool === key
                    ? 'bg-accent text-primary'
                    : 'text-muted hover:bg-card border-subtle hover:text-primary'
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
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Sections ({sections.length})</p>
          {sections.map((s, idx) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer mb-1 transition-all ${selectedId === s.id ? 'bg-accent/20 border border-accent/30' : 'hover:bg-white/[0.04]'
                }`}
            >
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="text-xs text-slate-200 flex-1 truncate">{s.name}</span>
              <span className="text-xs text-muted">{s.seats.length}</span>
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
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle glass">
          <input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            className="bg-transparent text-sm font-semibold text-primary outline-none flex-1 min-w-0"
            placeholder="Layout name…"
          />

          <button
            type="button"
            data-testid="toggle-snap-grid"
            onClick={() => setSnapToGrid((prev) => !prev)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${snapToGrid
                ? 'bg-accent/30 border-accent/50 text-accent shadow-sm'
                : 'bg-white/[0.04] border-default text-muted hover:text-primary'
              }`}
            title="Toggle 20px Grid Snapping"
          >
            <Grid3X3 size={13} />
            <span>Snap to Grid {snapToGrid ? '(20px On)' : '(Off)'}</span>
          </button>



          {!hasStage && sections.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg font-medium">
              <span>⚠️ Stage Required</span>
            </div>
          )}

          <button
            data-testid="save-layout-button"
            onClick={handleSave}
            disabled={saving || sections.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-primary font-medium transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : savedOk ? <CheckCircle size={12} /> : <Save size={12} />}
            {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Layout'}
          </button>
        </div>

        {/* SVG Canvas Workspace */}
        <div className="flex-1 relative flex items-center justify-center p-4 bg-primary overflow-hidden select-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            preserveAspectRatio="xMidYMid meet"
            data-testid="admin-canvas-workspace"
            id="admin-canvas"
            className="w-full h-full max-w-full max-h-full object-contain admin-canvas-workspace"
            style={{ cursor: toolCursor[tool] }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleSVGClick}
            onDoubleClick={handleDoubleClick}
          >
            <defs>
              <pattern id="admin-grid-minor" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 0 0 H 20 V 20 H 0 Z" fill="none" stroke="var(--border-subtle)" strokeWidth="0.8" />
              </pattern>
              <pattern id="admin-grid-major" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#admin-grid-minor)" />
                <path d="M 0 0 H 100 V 100 H 0 Z" fill="none" stroke="var(--canvas-grid)" strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#admin-grid-major)" stroke="var(--border-default)" strokeWidth="1.2" />

            {/* Dimension ruler tick marks along top & left axes */}
            {Array.from({ length: Math.floor(CANVAS_W / 100) + 1 }).map((_, i) => (
              <text key={`rx-${i}`} x={i * 100 + 4} y={14} fill="var(--text-muted)" fontSize="9.5" fontWeight="600" fontFamily="JetBrains Mono, monospace" style={{ pointerEvents: 'none' }}>
                {i * 100}px
              </text>
            ))}
            {Array.from({ length: Math.floor(CANVAS_H / 100) + 1 }).map((_, i) => (
              i > 0 && (
                <text key={`ry-${i}`} x={4} y={i * 100 + 13} fill="var(--text-muted)" fontSize="9.5" fontWeight="600" fontFamily="JetBrains Mono, monospace" style={{ pointerEvents: 'none' }}>
                  {i * 100}px
                </text>
              )
            ))}

            {sections.map((s, idx) => {
              const path = renderShapePath(s.geometry);
              const pts = s.geometry.points ?? [];
              const centroid = calculateCentroid(pts);
              const minX = pts.length > 0 ? Math.min(...pts.map((p) => p.x)) : 0;
              const maxX = pts.length > 0 ? Math.max(...pts.map((p) => p.x)) : 0;
              const minY = pts.length > 0 ? Math.min(...pts.map((p) => p.y)) : 0;
              const maxY = pts.length > 0 ? Math.max(...pts.map((p) => p.y)) : 0;
              const bbox = { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
              const isSelected = selectedId === s.id;
              return (
                <g key={s.id} onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}>
                  {/* Seat dots preview (drawn behind) */}
                  {s.showSeats && s.seats.map((seat, si) => (
                    <g key={si}>
                      <circle
                        cx={seat.x}
                        cy={seat.y}
                        r="5"
                        fill="none"
                        stroke="rgba(255,255,255,0.4)"
                        strokeWidth="0.8"
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        data-testid={`grid-preview-seat-${si}`}
                        cx={seat.x}
                        cy={seat.y}
                        r="3.5"
                        fill={s.color}
                        fillOpacity="0.75"
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  ))}

                  {/* Block Centroid Labels: Code, Name, and Size Measurement */}
                  <g style={{ pointerEvents: 'none' }}>
                    <text x={centroid.x} y={centroid.y - 12} textAnchor="middle"
                      fill="var(--canvas-text)" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">{s.code}</text>
                    <text x={centroid.x} y={centroid.y + 2} textAnchor="middle"
                      fill="var(--text-secondary)" fontSize="9" fontFamily="Inter, sans-serif">{s.name}</text>
                    {/* Size measurement label pill */}
                    <rect
                      x={centroid.x - 40}
                      y={centroid.y + 10}
                      width="80"
                      height="15"
                      rx="4"
                      fill="var(--bg-card)"
                      stroke="var(--border-default)"
                      strokeWidth="0.8"
                    />
                    <text
                      x={centroid.x}
                      y={centroid.y + 21}
                      textAnchor="middle"
                      fill="var(--canvas-text)"
                      fontSize="8.5"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {`${Math.round(bbox.width)} × ${Math.round(bbox.height)} px`}
                    </text>
                  </g>

                  {/* Selected Shape Bounding Box CAD Dimension Lines */}
                  {isSelected && (
                    <g style={{ pointerEvents: 'none' }}>
                      {/* Top Width Dimension Line */}
                      <line x1={bbox.minX} y1={bbox.minY - 10} x2={bbox.maxX} y2={bbox.minY - 10} stroke="var(--accent-primary)" strokeWidth="1" strokeDasharray="3 2" />
                      <text x={(bbox.minX + bbox.maxX) / 2} y={bbox.minY - 14} textAnchor="middle" fill="var(--canvas-text)" fontSize="8.5" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                        {`w: ${Math.round(bbox.width)}px`}
                      </text>
                      {/* Right Height Dimension Line */}
                      <line x1={bbox.maxX + 10} y1={bbox.minY} x2={bbox.maxX + 10} y2={bbox.maxY} stroke="var(--accent-primary)" strokeWidth="1" strokeDasharray="3 2" />
                      <text x={bbox.maxX + 15} y={(bbox.minY + bbox.maxY) / 2 + 3} textAnchor="start" fill="var(--canvas-text)" fontSize="8.5" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                        {`h: ${Math.round(bbox.height)}px`}
                      </text>
                    </g>
                  )}
                  {/* Selected Shape Interactive Corner Resize Handles */}
                  {isSelected && (
                    <g>
                      {/* Top-Left Handle */}
                      <rect
                        x={bbox.minX - 5} y={bbox.minY - 5} width="10" height="10"
                        fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" rx="2"
                        style={{ cursor: 'nwse-resize' }}
                        onMouseDown={(e) => { e.stopPropagation(); setResizingHandle({ sectionId: s.id, handle: 'tl' }); }}
                      />
                      {/* Top-Right Handle */}
                      <rect
                        x={bbox.maxX - 5} y={bbox.minY - 5} width="10" height="10"
                        fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" rx="2"
                        style={{ cursor: 'nesw-resize' }}
                        onMouseDown={(e) => { e.stopPropagation(); setResizingHandle({ sectionId: s.id, handle: 'tr' }); }}
                      />
                      {/* Bottom-Left Handle */}
                      <rect
                        x={bbox.minX - 5} y={bbox.maxY - 5} width="10" height="10"
                        fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" rx="2"
                        style={{ cursor: 'nesw-resize' }}
                        onMouseDown={(e) => { e.stopPropagation(); setResizingHandle({ sectionId: s.id, handle: 'bl' }); }}
                      />
                      {/* Bottom-Right Handle */}
                      <rect
                        x={bbox.maxX - 5} y={bbox.maxY - 5} width="10" height="10"
                        fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" rx="2"
                        style={{ cursor: 'nwse-resize' }}
                        onMouseDown={(e) => { e.stopPropagation(); setResizingHandle({ sectionId: s.id, handle: 'br' }); }}
                      />
                    </g>
                  )}

                  {/* Fill Path (drawn on top) */}
                  {s.shapeType === 'STAGE' ? (
                    <g key={`stage-shape-${s.id}`}>
                      <path
                        d={path}
                        data-testid={`admin-section-shape-${idx + 1}`}
                        className="canvas-section"
                        fill="#312e81"
                        fillOpacity={isSelected ? 0.95 : 0.85}
                        stroke={isSelected ? '#ffffff' : '#818cf8'}
                        strokeWidth={isSelected ? 2.5 : 1.8}
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
                      <text
                        x={centroid.x}
                        y={centroid.y + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="800"
                        letterSpacing="2"
                        fontFamily="Inter, sans-serif"
                        style={{ pointerEvents: 'none' }}
                      >
                        STAGE
                      </text>
                    </g>
                  ) : (
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
                  )}
                </g>
              );
            })}

            {/* Active draw preview */}
            {drawing && (tool === 'rectangle' || tool === 'stage') && rectStart && rectCurrent && (() => {
              const x = Math.min(rectStart.x, rectCurrent.x);
              const y = Math.min(rectStart.y, rectCurrent.y);
              const w = Math.abs(rectCurrent.x - rectStart.x);
              const h = Math.abs(rectCurrent.y - rectStart.y);
              const isStagePreview = tool === 'stage';
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={isStagePreview ? 'rgba(79, 70, 229, 0.4)' : 'rgba(99,102,241,0.15)'}
                    stroke={isStagePreview ? '#818cf8' : '#6366f1'}
                    strokeWidth="2"
                    strokeDasharray="6 3"
                  />
                  {isStagePreview && (
                    <text
                      x={x + w / 2}
                      y={y + h / 2 + 4}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="13"
                      fontWeight="800"
                      letterSpacing="2"
                      fontFamily="Inter, sans-serif"
                    >
                      STAGE
                    </text>
                  )}
                </g>
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
        className="w-72 flex-shrink-0 border-l border-subtle flex flex-col overflow-hidden property-editor-panel"
      >
        <div className="px-4 py-3 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-muted" />
            <span className="text-xs font-semibold text-secondary">Properties</span>
          </div>
        </div>
        {!selectedSection ? (
          <div className="flex-1 flex items-center justify-center text-center text-slate-600 text-xs px-4">
            Select a section to edit its properties
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            <Field label="Name">
              <input
                type="text"
                name="sectionName"
                data-testid="input-section-name"
                value={selectedSection.name}
                onChange={(e) => updateSection(selectedSection.id, { name: e.target.value })}
                className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
              />
            </Field>

            <Field label="Code">
              <input
                type="text"
                name="sectionCode"
                data-testid="input-section-code"
                value={selectedSection.code}
                onChange={(e) => updateSection(selectedSection.id, { code: e.target.value.toUpperCase() })}
                className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50 uppercase"
              />
            </Field>

            {/* Pricing Tier Dropdown */}
            {selectedSection.shapeType !== 'STAGE' && (
              <Field label="Pricing Tier">
                <div className="flex gap-2">
                  <select
                    value={selectedSection.tierId || ''}
                    onChange={(e) => {
                      const tier = pricingTiers.find(t => t.id === e.target.value);
                      if (tier) {
                        updateSection(selectedSection.id, { tierId: tier.id, color: tier.color, price: tier.basePrice });
                      }
                    }}
                    className="flex-1 bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50 appearance-none"
                  >
                    <option value="" disabled>Select a tier...</option>
                    {pricingTiers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} (Rp {t.basePrice.toLocaleString('id-ID')})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowTierManager(true)}
                    className="px-3 py-2 bg-card border-subtle border border-default rounded-lg text-xs font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </Field>
            )}

            {/* Shape Dimensions Controls (Width & Height) */}
            <div className="bg-card border-subtle border border-subtle rounded-xl p-3 flex flex-col gap-2.5">
              <span className="text-xs font-semibold text-secondary">Shape Dimensions</span>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width (px)">
                  <input
                    type="number"
                    min="20"
                    max="1000"
                    data-testid="input-shape-width"
                    value={Math.round(selectedBbox.width)}
                    onChange={(e) => {
                      const w = Math.max(20, Number(e.target.value));
                      resizeSectionShape(selectedSection.id, w, selectedBbox.height);
                    }}
                    className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                  />
                </Field>
                <Field label="Height (px)">
                  <input
                    type="number"
                    min="20"
                    max="700"
                    data-testid="input-shape-height"
                    value={Math.round(selectedBbox.height)}
                    onChange={(e) => {
                      const h = Math.max(20, Number(e.target.value));
                      resizeSectionShape(selectedSection.id, selectedBbox.width, h);
                    }}
                    className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                  />
                </Field>
              </div>
            </div>

            {selectedSection.shapeType === 'STAGE' ? (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex flex-col gap-1 text-xs text-accent">
                <span className="font-semibold text-primary">Stage Landmark</span>
                <span>Stage area contains 0 seats. Non-clickable background landmark element. This element has no price or seat availability attributes.</span>
              </div>
            ) : (
              <>
                {/* Toggle Seat Grid Config Configurator */}
                <button
                  data-testid="btn-open-grid-generator"
                  onClick={() => {
                    setTempRowCount(selectedSection.rowCount);
                    setTempSeatsPerRow(selectedSection.seatsPerRow);
                    setShowGridConfig(!showGridConfig);
                  }}
                  className="w-full py-2 bg-accent/20 hover:bg-accent/30 border border-indigo-500/20 rounded-lg text-xs font-semibold text-accent flex items-center justify-center gap-1.5 transition-all"
                >
                  <Grid3X3 size={12} />
                  Grid Setup
                </button>

                {showGridConfig && (
                  <div className="bg-card border-subtle border border-subtle rounded-xl p-3 flex flex-col gap-3">
                    <Field label="Row Count">
                      <input
                        type="number"
                        name="rowCount"
                        data-testid="input-row-count"
                        value={tempRowCount}
                        onChange={(e) => setTempRowCount(Number(e.target.value))}
                        className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                      />
                    </Field>

                    <Field label="Seats Per Row">
                      <input
                        type="number"
                        name="seatsPerRow"
                        data-testid="input-seats-per-row"
                        value={tempSeatsPerRow}
                        onChange={(e) => setTempSeatsPerRow(Number(e.target.value))}
                        className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                      />
                    </Field>

                    <button
                      data-testid="btn-apply-grid-generator"
                      onClick={handleApplyGridGenerator}
                      className="w-full py-2 bg-accent text-primary rounded-lg text-xs font-bold hover:bg-accent-hover transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                )}

                <div className="bg-white/[0.04] rounded-lg px-3 py-2.5">
                  <p className="text-xs text-muted">Generated seats</p>
                  <p className="text-lg font-bold text-primary mt-0.5">{selectedSection.seats.length}</p>
                  <p className="text-xs text-muted">inside polygon boundary</p>
                </div>

                <button
                  onClick={() => updateSection(selectedSection.id, { showSeats: !selectedSection.showSeats })}
                  className="flex items-center gap-2 text-xs text-muted hover:text-primary transition-colors"
                >
                  {selectedSection.showSeats ? <EyeOff size={12} /> : <Eye size={12} />}
                  {selectedSection.showSeats ? 'Hide' : 'Show'} seat preview
                </button>
              </>
            )}

            <button
              onClick={() => deleteSection(selectedSection.id)}
              className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors mt-auto"
            >
              <Trash2 size={12} /> Delete section
            </button>
          </div>
        )}
      </div>

      {/* Tier Manager Modal */}
      {showTierManager && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-primary border border-default rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl animate-fade-in max-h-[90vh] h-[600px] overflow-hidden">
            <div className="px-6 py-4 border-b border-subtle flex justify-between items-center bg-card border-subtle">
              <div>
                <h3 className="text-lg font-bold text-primary">Pricing Tiers Manager</h3>
                <p className="text-sm text-muted">Select a tier to customize its settings, colors, and pricing.</p>
              </div>
              <button onClick={() => { setShowTierManager(false); setSelectedEditTierId(null); }} className="text-muted hover:text-primary transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar: List of Tiers */}
              <div className="w-1/3 border-r border-subtle flex flex-col bg-card border-subtle overflow-hidden">
                <div className="p-4 border-b border-subtle">
                  <button
                    onClick={() => {
                      const newId = 'tier-' + Math.random().toString(36).substr(2, 6);
                      setPricingTiers([...pricingTiers, { id: newId, name: 'New Tier', color: '#cbd5e1', basePrice: 100000 }]);
                      setSelectedEditTierId(newId);
                    }}
                    className="w-full py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} />
                    Create Tier
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {pricingTiers.map((tier) => (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedEditTierId(tier.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all ${selectedEditTierId === tier.id ? 'bg-card border-subtle border border-default shadow-sm' : 'hover:bg-card border-subtle/50 border border-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: tier.color }} />
                        <div>
                          <p className="text-sm font-bold text-primary">{tier.name}</p>
                          <p className="text-xs text-muted">Rp {tier.basePrice.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                  {pricingTiers.length === 0 && (
                    <div className="text-center text-muted text-sm py-8">No tiers found. Create one above.</div>
                  )}
                </div>
              </div>

              {/* Right Panel: Edit Selected Tier */}
              <div className="w-2/3 flex flex-col overflow-hidden bg-primary">
                {selectedEditTierId && pricingTiers.find(t => t.id === selectedEditTierId) ? (() => {
                  const idx = pricingTiers.findIndex(t => t.id === selectedEditTierId);
                  const tier = pricingTiers[idx];
                  return (
                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                      <div className="flex items-center justify-between pb-4 border-b border-subtle">
                        <h4 className="text-lg font-bold text-primary flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tier.color }} />
                          {tier.name} Settings
                        </h4>
                        <button 
                          onClick={() => {
                            setPricingTiers(pricingTiers.filter((_, i) => i !== idx));
                            setSelectedEditTierId(null);
                          }}
                          className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 size={14} /> Delete Tier
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-5">
                        <Field label="Tier Name">
                          <input
                            type="text"
                            value={tier.name}
                            onChange={(e) => {
                              const newTiers = [...pricingTiers];
                              newTiers[idx].name = e.target.value;
                              setPricingTiers(newTiers);
                            }}
                            className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                          />
                        </Field>

                        <Field label="Base Price (Rp)">
                          <input
                            type="number"
                            value={tier.basePrice}
                            onChange={(e) => {
                              const newPrice = Number(e.target.value);
                              const newTiers = [...pricingTiers];
                              newTiers[idx].basePrice = newPrice;
                              setPricingTiers(newTiers);
                              setSections(prev => prev.map(s => s.tierId === tier.id ? { ...s, price: newPrice } : s));
                            }}
                            className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                          />
                        </Field>
                        
                        <div className="col-span-2">
                          <Field label="Tier Color">
                            <div className="flex items-center gap-4 bg-card border-subtle border border-default rounded-xl p-3">
                              <label
                                className="relative cursor-pointer w-10 h-10 rounded-lg border border-black/10 flex items-center justify-center overflow-hidden hover:scale-105 transition-transform shadow-sm"
                                style={{ background: tier.color }}
                              >
                                <input
                                  type="color"
                                  value={tier.color.startsWith('#') && tier.color.length === 7 ? tier.color : '#6366f1'}
                                  onChange={(e) => {
                                    const newColor = e.target.value;
                                    const newTiers = [...pricingTiers];
                                    newTiers[idx].color = newColor;
                                    setPricingTiers(newTiers);
                                    setSections(prev => prev.map(s => s.tierId === tier.id ? { ...s, color: newColor } : s));
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                  title="Pick Custom Color"
                                />
                              </label>
                              
                              <div className="h-8 w-px bg-default mx-1" />
                              
                              <div className="flex gap-2 flex-wrap">
                                {['#f59e0b', '#eab308', '#94a3b8', '#fb923c', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9'].map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                      const newTiers = [...pricingTiers];
                                      newTiers[idx].color = c;
                                      setPricingTiers(newTiers);
                                      setSections(prev => prev.map(s => s.tierId === tier.id ? { ...s, color: c } : s));
                                    }}
                                    className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${tier.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-2 ring-offset-secondary scale-110 shadow-sm' : 'opacity-90 hover:opacity-100'}`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                  />
                                ))}
                              </div>
                            </div>
                          </Field>
                        </div>

                        <div className="col-span-2">
                          <Field label="Description & Perks">
                            <textarea
                              value={tier.description || ''}
                              onChange={(e) => {
                                const newTiers = [...pricingTiers];
                                newTiers[idx].description = e.target.value;
                                setPricingTiers(newTiers);
                              }}
                              rows={3}
                              className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50 resize-y"
                              placeholder="e.g. VIP seating with backstage access..."
                            />
                          </Field>
                        </div>

                        <div className="col-span-2">
                          <Field label="Sales End Date">
                            <input
                              type="datetime-local"
                              value={tier.salesEndDate ? new Date(tier.salesEndDate).toISOString().slice(0, 16) : ''}
                              onChange={(e) => {
                                const newTiers = [...pricingTiers];
                                newTiers[idx].salesEndDate = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                setPricingTiers(newTiers);
                              }}
                              className="w-full bg-card border-subtle text-primary text-sm rounded-lg px-3 py-2 outline-none border border-default focus:border-accent/50"
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex-1 flex items-center justify-center text-muted flex-col gap-3">
                    <Settings size={32} className="opacity-20" />
                    <p>Select a tier from the left to edit its details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {savedOk && (
        <div
          data-testid="toast-notification"
          className="toast-success fixed bottom-4 right-4 bg-emerald-600 text-primary px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50 text-xs font-medium"
        >
          <CheckCircle size={14} />
          Layout saved successfully!
        </div>
      )}

      {saveError && (
        <div
          data-testid="toast-notification-error"
          className="toast-error fixed bottom-4 right-4 bg-red-600/90 text-primary px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50 text-xs font-medium border border-red-500/50 max-w-xs"
        >
          <X size={14} />
          {saveError}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
