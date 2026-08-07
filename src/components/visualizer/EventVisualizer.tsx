'use client';

import React, { useState, useCallback, useEffect, useId, useRef } from 'react';
import { EventDTO, SectionDTO, SeatDTO } from '@/types/venue';
import { VenueMapCanvas } from '@/components/visualizer/VenueMapCanvas';
import { SeatGridPicker } from '@/components/visualizer/SeatGridPicker';
import { BookingCartSidebar } from '@/components/visualizer/BookingCartSidebar';
import { getSectionSeats } from '@/actions/getSectionSeats';
import { ArrowLeft, Loader2, Users, X } from 'lucide-react';

interface EventVisualizerProps {
  event: EventDTO;
}

type View = 'map' | 'seats';

export function EventVisualizer({ event }: EventVisualizerProps) {
  const [sessionId, setSessionId] = useState<string>('anonymous');

  useEffect(() => {
    const id = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    Promise.resolve().then(() => setSessionId(id));
  }, []);
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

  const lastLockedIdsRef = useRef<string[]>([]);
  const [lockError, setLockError] = useState<string | null>(null);

  const handleToggleSeat = useCallback((seat: SeatDTO) => {
    const isDeselecting = selectedSeatIds.has(seat.id);
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });
    // Optimistically mark deselected seat as AVAILABLE in local state
    if (isDeselecting) {
      setSeats((prev) => prev.map((s) =>
        s.id === seat.id ? { ...s, status: 'AVAILABLE' } : s
      ));
    }
  }, [selectedSeatIds]);

  const handleClearSeat = useCallback((seatId: string) => {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
    // Optimistically mark cleared seat as AVAILABLE in local state
    setSeats((prev) => prev.map((s) =>
      s.id === seatId ? { ...s, status: 'AVAILABLE' } : s
    ));
  }, []);

  const handleBookingComplete = useCallback(async () => {
    if (!selectedSection) return;
    // Refresh seats
    lastLockedIdsRef.current = [];
    setSelectedSeatIds(new Set());
    const refreshed = await getSectionSeats(selectedSection.id);
    setSeats(refreshed);
  }, [selectedSection]);

  const handleBackToMap = useCallback(() => {
    // Release locks in database immediately
    fetch('/api/reservations/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: event.id,
        seatIds: [],
        userSessionId: sessionId,
      }),
    }).catch((err) => console.error('Failed to release locks on back:', err));

    setView('map');
    setSelectedSection(null);
    setSeats([]);
    lastLockedIdsRef.current = [];
    setSelectedSeatIds(new Set());
  }, [event.id, sessionId]);

  // Synchronize seat states (polling) in real-time when seat picker is open
  useEffect(() => {
    if (view !== 'seats' || !selectedSection) return;

    let active = true;
    const intervalId = setInterval(async () => {
      try {
        const refreshed = await getSectionSeats(selectedSection.id);
        if (active) {
          setSeats(refreshed);
        }
      } catch (err) {
        console.error('Failed to poll seat updates:', err);
      }
    }, 3000); // 3 seconds interval

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [view, selectedSection]);

  // Debounced database lock synchronization
  useEffect(() => {
    if (view !== 'seats' || !selectedSection) return;

    const currentIds = Array.from(selectedSeatIds).sort();
    const lastIds = [...lastLockedIdsRef.current].sort();

    // Skip redundant sync calls
    if (JSON.stringify(currentIds) === JSON.stringify(lastIds)) {
      return;
    }

    const timerId = setTimeout(async () => {
      setLockError(null);
      try {
        const response = await fetch('/api/reservations/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: event.id,
            seatIds: currentIds,
            userSessionId: sessionId,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          if (data.unavailableIds && Array.isArray(data.unavailableIds) && data.unavailableIds.length > 0) {
            const badIds = new Set<string>(data.unavailableIds);
            
            // Clean up bad/stale seats from current selection
            setSelectedSeatIds((prev) => {
              const next = new Set(prev);
              badIds.forEach((id) => next.delete(id));
              return next;
            });

            // Update last locked reference to exclude the bad seats
            lastLockedIdsRef.current = lastLockedIdsRef.current.filter((id) => !badIds.has(id));

            setLockError(data.error || 'Some seats in your cart are no longer available and have been removed.');
            return; // Return early; state change will trigger re-sync for remaining seats
          }

          throw new Error(data.error || 'One or more seats are no longer available.');
        }
        // Success: update reference
        lastLockedIdsRef.current = currentIds;
      } catch (err: any) {
        // Revert to the last successfully locked state
        setSelectedSeatIds(new Set(lastLockedIdsRef.current));
        setLockError(err.message || 'Selected seats are no longer available.');
      }
    }, 400); // 400ms debounce delay

    return () => clearTimeout(timerId);
  }, [selectedSeatIds, view, selectedSection, event.id, sessionId]);

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

                {lockError && (
                  <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-red-400 font-medium">
                    <span>{lockError}</span>
                    <button onClick={() => setLockError(null)} className="p-1 hover:text-red-300 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                )}

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
