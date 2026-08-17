'use client';

import React, { useState, useCallback, useRef } from 'react';
import { SectionDTO, EventDTO } from '@/types/venue';
import { renderShapePath, calculateBoundingBox, calculateCentroid } from '@/lib/geometry';

interface Tooltip {
  section: SectionDTO;
  x: number;
  y: number;
}

interface VenueMapCanvasProps {
  event: EventDTO;
  onSectionSelect: (section: SectionDTO) => void;
  selectedSectionId?: string | null;
}

export function VenueMapCanvas({ event, onSectionSelect, selectedSectionId }: VenueMapCanvasProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { viewBoxWidth: vbW, viewBoxHeight: vbH, sections } = event;

  const getAvailabilityGrade = (section: SectionDTO) => {
    if (section.totalSeats === 0) return 0;
    return section.availableSeats / section.totalSeats;
  };

  const getSectionOpacity = (section: SectionDTO) => {
    const grade = getAvailabilityGrade(section);
    if (grade === 0) return 0.25;
    if (grade < 0.15) return 0.5;
    return 0.85;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = vbW / rect.width;
    const scaleY = vbH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (tooltip) {
      setTooltip((prev) => prev ? { ...prev, x, y } : null);
    }
  }, [tooltip, vbW, vbH]);

  const handleSectionMouseEnter = useCallback((section: SectionDTO, e: React.MouseEvent) => {
    if (section.shapeType === 'STAGE' || section.geometry?.shapeType === 'STAGE') return;
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = vbW / rect.width;
    const scaleY = vbH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setHoveredId(section.id);
    setTooltip({ section, x, y });
  }, [vbW, vbH]);

  const handleSectionMouseLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  // Dynamic viewBox zoom calculation based on selectedSectionId
  let currentViewBox = `0 0 ${vbW} ${vbH}`;
  if (selectedSectionId) {
    const selectedSection = sections.find((s) => s.id === selectedSectionId);
    if (selectedSection) {
      const pts = selectedSection.geometry.points?.length >= 3
        ? selectedSection.geometry.points
        : (selectedSection.geometry.x !== undefined ? [
          { x: selectedSection.geometry.x, y: selectedSection.geometry.y! },
          { x: selectedSection.geometry.x + selectedSection.geometry.width!, y: selectedSection.geometry.y! },
          { x: selectedSection.geometry.x + selectedSection.geometry.width!, y: selectedSection.geometry.y! + selectedSection.geometry.height! },
          { x: selectedSection.geometry.x, y: selectedSection.geometry.y! + selectedSection.geometry.height! },
        ] : []);

      if (pts.length >= 3) {
        const bbox = calculateBoundingBox(pts);
        const padding = Math.min(bbox.width, bbox.height) * 0.15;
        const zoomedX = Math.round(Math.max(0, bbox.minX - padding));
        const zoomedY = Math.round(Math.max(0, bbox.minY - padding));
        const zoomedW = Math.round(bbox.width + padding * 2);
        const zoomedH = Math.round(bbox.height + padding * 2);
        currentViewBox = `${zoomedX} ${zoomedY} ${zoomedW} ${zoomedH}`;
      }
    }
  }

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        viewBox={currentViewBox}
        data-testid="venue-svg-map"
        className="w-full h-full venue-map"
        style={{ background: 'var(--bg-primary)', transition: 'viewBox 0.4s ease-in-out' }}
        onMouseMove={handleMouseMove}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border-subtle)" strokeWidth="0.5" />
          </pattern>
          <filter id="glow-filter">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={vbW} height={vbH} fill="url(#grid)" />

        {/* Sections */}
        {sections.map((section) => {
          const pts = section.geometry.points?.length >= 3
            ? section.geometry.points
            : (section.geometry.x !== undefined ? [
              { x: section.geometry.x, y: section.geometry.y! },
              { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! },
              { x: section.geometry.x + section.geometry.width!, y: section.geometry.y! + section.geometry.height! },
              { x: section.geometry.x, y: section.geometry.y! + section.geometry.height! },
            ] : []);

          if (pts.length < 3) return null;

          const path = renderShapePath(section.geometry);
          const centroid = calculateCentroid(pts);
          const bbox = calculateBoundingBox(pts);
          const isHovered = hoveredId === section.id;
          const isSelected = selectedSectionId === section.id;
          const opacity = getSectionOpacity(section);
          const grade = getAvailabilityGrade(section);
          const ringColor = grade === 0 ? '#ef4444' : grade < 0.3 ? '#f59e0b' : '#22d3ee';

          const isStage = section.shapeType === 'STAGE' || section.geometry?.shapeType === 'STAGE';

          if (isStage) {
            return (
              <g key={section.id} style={{ pointerEvents: 'none' }}>
                <path
                  d={path}
                  data-testid={`section-shape-${section.id}`}
                  data-shape="STAGE"
                  fill="var(--bg-secondary)"
                  fillOpacity="0.85"
                  stroke="var(--border-accent)"
                  strokeWidth="2.5"
                />
                <text
                  x={centroid.x}
                  y={centroid.y + 4}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize={Math.max(11, Math.min(bbox.width, bbox.height) * 0.20)}
                  fontWeight="700"
                  letterSpacing="2"
                  fontFamily="Inter, sans-serif"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  STAGE
                </text>
              </g>
            );
          }

          return (
            <g
              key={section.id}
              className="venue-section section-group cursor-pointer"
              data-testid="section-shape"
              onClick={() => onSectionSelect(section)}
              onMouseEnter={(e) => handleSectionMouseEnter(section, e)}
              onMouseLeave={handleSectionMouseLeave}
            >


              <text
                x={centroid.x}
                y={centroid.y - Math.min(bbox.width, bbox.height) * 0.12}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize={Math.max(10, Math.min(bbox.width, bbox.height) * 0.10)}
                fontWeight="700"
                fontFamily="Inter, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {section.code}
              </text>

              <text
                x={centroid.x}
                y={centroid.y + Math.min(bbox.width, bbox.height) * 0.15}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={Math.max(8, Math.min(bbox.width, bbox.height) * 0.075)}
                fontFamily="Inter, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                Rp {section.price.toLocaleString('id-ID')}
              </text>

              <path
                d={path}
                data-testid={`section-shape-${section.id}`}
                data-shape={section.shapeType}
                className={`section-shape ${isHovered ? 'hovered' : ''} ${isSelected ? 'active highlighted' : ''}`}
                fill={section.color}
                fillOpacity={isHovered || isSelected ? 0.55 : 0.35}
                stroke={isSelected ? '#ffffff' : isHovered ? section.color : `${section.color}80`}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                onClick={() => onSectionSelect(section)}
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const s = tooltip.section;
          const tipW = 160;
          const tipH = 80;
          const tx = Math.min(tooltip.x + 12, vbW - tipW - 8);
          const ty = Math.max(tooltip.y - tipH - 12, 8);
          const grade = getAvailabilityGrade(s);
          const tierName = s.tierName || (s as any).pricingTier?.name || (
            s.price >= 120 ? 'VIP Tier' :
              s.price <= 45 ? 'Economy Tier' :
                'Standard Tier'
          );
          return (
            <g
              data-testid="section-tooltip"
              className="tooltip-venue section-tooltip"
              style={{ pointerEvents: 'none' }}
            >
              <rect x={tx} y={ty} width={tipW} height={tipH} rx="6"
                fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth="1" />
              <text x={tx + 10} y={ty + 20} fill="var(--text-primary)" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">
                {s.name}
              </text>
              {tierName && (
                <text x={tx + 10} y={ty + 35} fill={s.tierColor ?? (s as any).pricingTier?.color ?? 'var(--text-muted)'} fontSize="9" fontFamily="Inter, sans-serif">
                  {tierName}
                </text>
              )}
              <text x={tx + 10} y={ty + 50} fill="var(--text-secondary)" fontSize="9" fontFamily="Inter, sans-serif">
                Rp {s.price.toLocaleString('id-ID')} per seat
              </text>
              <text x={tx + 10} y={ty + 65} fill={grade < 0.2 ? 'var(--accent-hover)' : 'var(--text-muted)'} fontSize="9" fontFamily="Inter, sans-serif">
                {s.availableSeats} available
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
