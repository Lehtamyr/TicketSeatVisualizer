'use client';

import React, { useState, useCallback, useEffect, useId, useRef, useMemo } from 'react';
import { EventDTO, SectionDTO, SeatDTO } from '@/types/venue';
import { VenueMapCanvas } from '@/components/visualizer/VenueMapCanvas';
import { SeatGridPicker } from '@/components/visualizer/SeatGridPicker';
import { BookingCartSidebar } from '@/components/visualizer/BookingCartSidebar';
import { getSectionSeats } from '@/actions/getSectionSeats';
import { generateSeatGrid } from '@/lib/seatGenerator';
import { ArrowLeft, Loader2, Users, X } from 'lucide-react';

interface EventVisualizerProps {
  event: EventDTO;
}

// Session ID lives at module scope — evaluated once when this module is first imported
// on the client. On the server (SSR) it returns a static placeholder; on the client
// it reads/writes sessionStorage so every browser tab gets a stable unique ID.
let _sessionId: string | null = null;
function getTabSessionId(): string {
  if (typeof window === 'undefined') return 'sess-ssr';
  if (_sessionId) return _sessionId;
  let id = window.sessionStorage.getItem('seat_session_id');
  if (!id) {
    id = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    window.sessionStorage.setItem('seat_session_id', id);
  }
  _sessionId = id;
  return id;
}

type View = 'map' | 'seats';

export function EventVisualizer({ event }: EventVisualizerProps) {
  // getTabSessionId() reads sessionStorage — safe to call during render on client.
  // On SSR it returns 'sess-ssr' but no lock calls happen server-side.
  const sessionId = getTabSessionId();

  const [view, setView] = useState<View>('map');
  const [selectedSection, setSelectedSection] = useState<SectionDTO | null>(null);
  const [seats, setSeats] = useState<SeatDTO[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());

  const fetchLiveSectionSeats = useCallback(async (sectionId: string): Promise<SeatDTO[]> => {
    try {
      const freshSeats = await getSectionSeats(sectionId);
      if (freshSeats && freshSeats.length > 0) {
        return freshSeats;
      }
    } catch (err) {
      console.error('Failed to fetch live section seats:', err);
    }
    return [];
  }, []);

  const handleSectionSelect = useCallback(async (section: SectionDTO) => {
    if (section.shapeType === 'STAGE' || section.geometry?.shapeType === 'STAGE') return;
    setSelectedSection(section);
    setView('seats');
    setSelectedSeatIds(new Set());

    setLoadingSeats(true);
    try {
      const loaded = await fetchLiveSectionSeats(section.id);
      if (loaded && loaded.length > 0) {
        setSeats(loaded);
      } else if ((section as any).seats && (section as any).seats.length > 0) {
        setSeats((section as any).seats);
      } else {
        setSeats([]);
      }
    } catch (err) {
      console.error('Failed to load seats:', err);
      if ((section as any).seats && (section as any).seats.length > 0) {
        setSeats((section as any).seats);
      }
    } finally {
      setLoadingSeats(false);
    }
  }, [fetchLiveSectionSeats]);

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
    const refreshed = await fetchLiveSectionSeats(selectedSection.id);
    setSeats(refreshed);
  }, [selectedSection, fetchLiveSectionSeats]);

  const handleBackToMap = useCallback(() => {
    // Only release locks if we have a real client-side session ID (not SSR placeholder).
    if (sessionId && sessionId !== 'sess-ssr') {
      fetch('/api/reservations/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          seatIds: [],
          userSessionId: sessionId,
        }),
      }).catch((err) => console.error('Failed to release locks on back:', err));
    }

    setView('map');
    setSelectedSection(null);
    setSeats([]);
    lastLockedIdsRef.current = [];
    setSelectedSeatIds(new Set());
  }, [event.id, sessionId]);

  // Real-time Server-Sent Events (SSE) listener & fallback polling
  useEffect(() => {
    if (view !== 'seats' || !selectedSection) return;

    let active = true;

    // 1. Establish SSE real-time stream connection
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/events/${event.id}/seat-stream`);
      eventSource.onmessage = (evt) => {
        try {
          if (!evt.data || evt.data.startsWith(':')) return;
          const update = JSON.parse(evt.data);
          if (update.seatIds && Array.isArray(update.seatIds)) {
            const affectedIds = new Set(update.seatIds);
            setSeats((prev) =>
              prev.map((s) => {
                if (affectedIds.has(s.id)) {
                  // Don't overwrite locally selected seats for current user
                  if (selectedSeatIds.has(s.id) && update.userSessionId === sessionId) {
                    return s;
                  }
                  return {
                    ...s,
                    status: update.status as SeatDTO['status'],
                    heldBy: update.userSessionId,
                  };
                }
                return s;
              })
            );
          }
        } catch (err) {
          // Ignore non-json ping signals
        }
      };
    } catch (err) {
      console.error('Failed to connect SSE seat stream:', err);
    }

    // 2. Fallback polling (1.5 seconds)
    // ponytail: fallback polling also uses server action to bypass Next.js GET caching.
    // Upgrade path: could drop polling entirely if SSE is 100% reliable, or increase interval.
    const refreshSeats = async () => {
      try {
        const freshSeats = await getSectionSeats(selectedSection.id);
        if (active && freshSeats && freshSeats.length > 0) {
          setSeats((prev) => {
            if (!prev || prev.length === 0) return freshSeats;
            const seatMap = new Map(freshSeats.map((s: any) => [s.id, s]));
            return prev.map((oldSeat) => {
              const updated: any = seatMap.get(oldSeat.id);
              if (updated) {
                return {
                  ...oldSeat,
                  ...updated,
                  price: updated.price ?? oldSeat.price,
                };
              }
              return oldSeat;
            });
          });
        }
      } catch (err) {
        console.error('Failed to poll seat updates:', err);
      }
    };

    const intervalId = setInterval(refreshSeats, 1500);

    // 3. Immediate refresh on window focus / tab switch
    const handleFocus = () => {
      refreshSeats();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      if (eventSource) eventSource.close();
    };
  }, [view, selectedSection, event.id, sessionId]);

  // Debounced database lock synchronization
  useEffect(() => {
    if (view !== 'seats' || !selectedSection || sessionId === 'sess-ssr') return;

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

  const effectiveSeats = useMemo(() => {
    if (seats && seats.length > 0) return seats;
    if (!selectedSection) return [];
    return generateSeatGrid({
      geometry: { ...selectedSection.geometry, clipToBoundary: false },
      rowCount: (selectedSection as any).rowCount || 5,
      seatsPerRow: (selectedSection as any).seatsPerRow || 5,
      seatRadius: 7,
      padding: 14,
      sectionId: selectedSection.id,
    }) as SeatDTO[];
  }, [seats, selectedSection]);

  const selectedSeatObjects = effectiveSeats.filter((s: SeatDTO) => selectedSeatIds.has(s.id));

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

          {/* Modal Dialog for SeatGridPicker */}
          {view === 'seats' && selectedSection && (
            <div
              data-testid="seat-grid-overlay"
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 seat-grid-picker"
            >
              <div
                className="w-full max-w-5xl bg-[#090d16] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
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

                {/* Modal Body: Seat Grid on Left, Booking Sidebar on Right */}
                <div className="flex flex-1 overflow-hidden">
                  <div className="flex-1 flex flex-col items-center justify-center overflow-hidden p-6">
                    {loadingSeats ? (
                      <div className="flex items-center gap-3 text-slate-400">
                        <Loader2 size={24} className="animate-spin" />
                        <span className="text-sm">Loading seats…</span>
                      </div>
                    ) : (
                      <SeatGridPicker
                        section={selectedSection}
                        seats={seats}
                        selectedIds={selectedSeatIds}
                        onToggleSeat={handleToggleSeat}
                        disabledSeatKeys={selectedSection.geometry?.disabledSeats || []}
                        sessionId={sessionId}
                      />
                    )}
                  </div>

                  {/* Right: booking cart */}
                  <div className="w-80 flex-shrink-0 p-4 border-l border-white/[0.06] bg-[#070a12] flex flex-col">
                    <BookingCartSidebar
                      section={selectedSection}
                      eventId={event.id}
                      selectedSeats={selectedSeatObjects}
                      onClearSeat={handleClearSeat}
                      onBookingComplete={handleBookingComplete}
                      userSessionId={sessionId}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
