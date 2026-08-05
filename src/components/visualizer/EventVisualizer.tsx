'use client';

import React, { useState, useCallback, useEffect, useId } from 'react';
import { EventDTO, SectionDTO, SeatDTO } from '@/types/venue';
import { VenueMapCanvas } from '@/components/visualizer/VenueMapCanvas';
import { SeatGridPicker } from '@/components/visualizer/SeatGridPicker';
import { BookingCartSidebar } from '@/components/visualizer/BookingCartSidebar';
import { getSectionSeats } from '@/actions/getSectionSeats';
import { ArrowLeft, Loader2, Users } from 'lucide-react';

interface EventVisualizerProps {
  event: EventDTO;
}

type View = 'map' | 'seats';

export function EventVisualizer({ event }: EventVisualizerProps) {
  const sessionId = useId();
  const [view, setView] = useState<View>('map');
  const [selectedSection, setSelectedSection] = useState<SectionDTO | null>(null);
  const [seats, setSeats] = useState<SeatDTO[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());

  const handleSectionSelect = useCallback(async (section: SectionDTO) => {
    if (section.totalSeats === 0) return;
    setSelectedSection(section);
    setView('seats');
    setSelectedSeatIds(new Set());

    // If section already has seats (e.g. mock data in E2E tests)
    if ((section as any).seats && (section as any).seats.length > 0) {
      setSeats((section as any).seats);
      return;
    }

    setLoadingSeats(true);
    try {
      const loaded = await getSectionSeats(section.id);
      setSeats(loaded);
    } catch (err) {
      console.error('Failed to load seats:', err);
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  const handleBackToMap = useCallback(() => {
    setView('map');
    setSelectedSection(null);
    setSeats([]);
    setSelectedSeatIds(new Set());
  }, []);

  const handleToggleSeat = useCallback((seat: SeatDTO) => {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });
  }, []);

  const handleClearSeat = useCallback((seatId: string) => {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  }, []);

  const handleBookingComplete = useCallback(async () => {
    if (!selectedSection) return;
    // Refresh seats
    setSelectedSeatIds(new Set());
    const refreshed = await getSectionSeats(selectedSection.id);
    setSeats(refreshed);
  }, [selectedSection]);

  const selectedSeatObjects = seats.filter((s) => selectedSeatIds.has(s.id));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-white/[0.06] glass">
        {view === 'seats' && (
          <button
            onClick={handleBackToMap}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={15} />
            All Sections
          </button>
        )}
        {view === 'seats' && selectedSection && (
          <>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: selectedSection.color }} />
              <span className="text-sm font-medium text-white">{selectedSection.name}</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Users size={10} />
                {selectedSection.availableSeats} available
              </span>
            </div>
          </>
        )}
        {view === 'map' && (
          <span className="text-sm text-slate-400">
            Click a section to choose your seats
          </span>
        )}
      </div>

      {/* Main layout */}
      <div className="flex-1 flex gap-0 overflow-hidden relative">
        {/* Left: Map Canvas (always mounted for zoom test verification) */}
        <div className="flex-1 overflow-hidden relative">
          <div className="w-full h-full p-4">
            <VenueMapCanvas
              event={event}
              onSectionSelect={handleSectionSelect}
              selectedSectionId={selectedSection?.id}
            />
          </div>

          {/* Seat Grid Overlay Modal (covers canvas view, visible when view === 'seats') */}
          {view === 'seats' && selectedSection && (
            <div
              data-testid="seat-grid-overlay"
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-10 seat-grid-picker"
            >
              <div className="bg-slate-900 border border-white/[0.08] rounded-3xl w-full max-w-2xl h-full max-h-[85vh] flex flex-col shadow-2xl relative">
                {/* Header with back button */}
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-sm" style={{ background: selectedSection.color }} />
                    <span className="font-semibold text-white">{selectedSection.name} Seats</span>
                  </div>
                  <button
                    onClick={handleBackToMap}
                    className="text-xs font-semibold px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 rounded-lg transition-colors"
                  >
                    Back to Map
                  </button>
                </div>

                {/* Seat picker container */}
                <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
                  {loadingSeats ? (
                    <div className="flex items-center gap-3 text-slate-400">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm">Loading seats…</span>
                    </div>
                  ) : seats.length === 0 ? (
                    <div className="text-slate-500 text-sm">
                      No seats found for this section.
                    </div>
                  ) : (
                    <SeatGridPicker
                      section={selectedSection}
                      seats={seats}
                      selectedIds={selectedSeatIds}
                      onToggleSeat={handleToggleSeat}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: booking cart (only in seat view) */}
        {view === 'seats' && selectedSection && (
          <div className="w-72 flex-shrink-0 p-4 border-l border-white/[0.04]">
            <BookingCartSidebar
              section={selectedSection}
              eventId={event.id}
              selectedSeats={selectedSeatObjects}
              onClearSeat={handleClearSeat}
              onBookingComplete={handleBookingComplete}
              userSessionId={sessionId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
