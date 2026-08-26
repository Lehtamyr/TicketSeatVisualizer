'use client';

import React, { useState, useCallback, useEffect, useId, useRef, useMemo } from 'react';
import Image from 'next/image';
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
  const [globalCart, setGlobalCart] = useState<Map<string, SeatDTO>>(new Map());
  const heroSectionRef = useRef<HTMLDivElement>(null);

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

    setLoadingSeats(true);
    try {
      const loaded = await fetchLiveSectionSeats(section.id);
      if (loaded && loaded.length > 0) {
        setSeats(loaded);
      } else if (section.seats && section.seats.length > 0) {
        setSeats(section.seats);
      } else {
        setSeats([]);
      }
    } catch (err) {
      console.error('Failed to load seats:', err);
      if (section.seats && section.seats.length > 0) {
        setSeats(section.seats);
      }
    } finally {
      setLoadingSeats(false);
    }
  }, [fetchLiveSectionSeats]);

  const lastLockedIdsRef = useRef<string[]>([]);
  const selectedSeatIdsRef = useRef<Set<string>>(selectedSeatIds);
  const pendingReleasedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedSeatIdsRef.current = selectedSeatIds;
  }, [selectedSeatIds]);
  const [lockError, setLockError] = useState<string | null>(null);

  const handleToggleSeat = useCallback((seat: SeatDTO) => {
    const isDeselecting = selectedSeatIds.has(seat.id);
    if (isDeselecting) {
      pendingReleasedIdsRef.current.add(seat.id);
    } else {
      pendingReleasedIdsRef.current.delete(seat.id);
    }

    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });
    
    setGlobalCart((prev) => {
      const next = new Map(prev);
      if (isDeselecting) next.delete(seat.id);
      else next.set(seat.id, seat);
      return next;
    });

    // Optimistically mark deselected seat as AVAILABLE in local state
    if (isDeselecting) {
      setSeats((prev) => prev.map((s) =>
        s.id === seat.id ? { ...s, status: 'AVAILABLE', heldBy: undefined } : s
      ));
    }
  }, [selectedSeatIds]);

  const handleClearSeat = useCallback((seatId: string) => {
    pendingReleasedIdsRef.current.add(seatId);

    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
    setGlobalCart((prev) => {
      const next = new Map(prev);
      next.delete(seatId);
      return next;
    });
    // Optimistically mark cleared seat as AVAILABLE in local state
    setSeats((prev) => prev.map((s) =>
      s.id === seatId ? { ...s, status: 'AVAILABLE', heldBy: undefined } : s
    ));
  }, []);

  const handleBookingComplete = useCallback(async () => {
    if (!selectedSection) return;
    // Refresh seats
    lastLockedIdsRef.current = [];
    pendingReleasedIdsRef.current.clear();
    setSelectedSeatIds(new Set());
    const refreshed = await fetchLiveSectionSeats(selectedSection.id);
    setSeats(refreshed);
  }, [selectedSection, fetchLiveSectionSeats]);

  const handleBackToMap = useCallback(() => {
    setView('map');
    setSelectedSection(null);
    setSeats([]);
  }, []);

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
            
            // Clean up any pending released IDs once an update arrives
            if (update.status === 'AVAILABLE') {
              update.seatIds.forEach((id: string) => pendingReleasedIdsRef.current.delete(id));
            }

            setSeats((prev) =>
              prev.map((s) => {
                if (affectedIds.has(s.id)) {
                  // Don't overwrite locally selected seats for current user
                  if (selectedSeatIdsRef.current.has(s.id) && update.userSessionId === sessionId) {
                    return s;
                  }
                  // Don't overwrite locally deselected seats if update is a stale HELD
                  if (pendingReleasedIdsRef.current.has(s.id) && update.status === 'HELD') {
                    return { ...s, status: 'AVAILABLE', heldBy: undefined };
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
                // If this seat is currently selected locally by the user, keep status as AVAILABLE or locally handled
                const isLocallySelected = selectedSeatIdsRef.current.has(oldSeat.id);
                // If this seat was recently deselected locally, prevent stale HELD status from overwriting
                const isPendingReleased = pendingReleasedIdsRef.current.has(oldSeat.id);
                const resolvedStatus = isLocallySelected || isPendingReleased
                  ? 'AVAILABLE'
                  : updated.status;

                return {
                  ...oldSeat,
                  ...updated,
                  status: resolvedStatus,
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

  // View-agnostic database lock synchronization
  // Runs in both 'seats' and 'map' view so clearing seats from the cart always syncs with the DB and broadcasts SSE
  useEffect(() => {
    if (sessionId === 'sess-ssr') return;

    const currentIds = Array.from(selectedSeatIds).sort();
    const lastIds = [...lastLockedIdsRef.current].sort();

    // Skip redundant sync calls
    if (JSON.stringify(currentIds) === JSON.stringify(lastIds)) {
      return;
    }

    // Fast-path: if deselected/released a seat, sync with minimal delay (50ms) to ensure other users see AVAILABLE instantly
    const isReleasing = currentIds.length < lastIds.length;
    const delay = isReleasing ? 50 : 250;

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

          setLockError(data.error || 'One or more seats are no longer available.');
          return;
        }
        // Success: update reference and clear confirmed released IDs
        lastLockedIdsRef.current = currentIds;
        currentIds.forEach((id) => pendingReleasedIdsRef.current.delete(id));
      } catch (err: any) {
        setLockError(err.message || 'Failed to sync selected seats.');
      }
    }, delay);

    return () => clearTimeout(timerId);
  }, [selectedSeatIds, event.id, sessionId]);

  const effectiveSeats = useMemo(() => {
    if (seats && seats.length > 0) return seats;
    if (!selectedSection) return [];
    return generateSeatGrid({
      geometry: { ...selectedSection.geometry, clipToBoundary: false },
      rowCount: selectedSection.rowCount || 5,
      seatsPerRow: selectedSection.seatsPerRow || 5,
      seatRadius: 7,
      padding: 14,
      sectionId: selectedSection.id,
    }) as SeatDTO[];
  }, [seats, selectedSection]);

  const selectedSeatObjects = Array.from(globalCart.values());

  const activeTiers = useMemo(() => {
    const nonStageSections = (event.sections || []).filter(
      (sec) => sec.shapeType !== 'STAGE' && sec.geometry?.shapeType !== 'STAGE'
    );

    if (nonStageSections.length === 0) return [];

    const layoutTiers = event.layout?.pricingTiers || [];
    const usedTierIds = new Set<string>();
    const usedTierNames = new Set<string>();
    const sectionsWithoutFormalTier: typeof nonStageSections = [];

    nonStageSections.forEach((sec) => {
      const matchedTier = layoutTiers.find(
        (t: any) =>
          (sec.tierId && t.id === sec.tierId) ||
          ((sec as any).pricingTierId && t.id === (sec as any).pricingTierId) ||
          (sec.tierName && t.name === sec.tierName)
      );

      if (matchedTier) {
        usedTierIds.add(matchedTier.id);
        usedTierNames.add(matchedTier.name);
      } else {
        sectionsWithoutFormalTier.push(sec);
      }
    });

    // Retain only layout tiers that are actively used by at least one section
    const inUseTiers: any[] = layoutTiers
      .filter((t: any) => usedTierIds.has(t.id) || usedTierNames.has(t.name))
      .map((t: any) => ({ ...t }));

    // Group remaining sections without formal tiers by distinct price
    if (sectionsWithoutFormalTier.length > 0) {
      const priceGroups = new Map<number, typeof nonStageSections>();
      sectionsWithoutFormalTier.forEach((sec) => {
        const p = sec.price || 0;
        if (!priceGroups.has(p)) priceGroups.set(p, []);
        priceGroups.get(p)!.push(sec);
      });

      priceGroups.forEach((secs, price) => {
        const sample = secs[0];
        const name = sample.tierName || `${sample.name || 'Standard'} Tier`;
        inUseTiers.push({
          id: sample.tierId || (sample as any).pricingTierId || `tier-fallback-${price}`,
          name: name,
          color: sample.tierColor || sample.color || 'var(--accent-primary)',
          basePrice: price,
          description: `Seating covering the ${name} areas.`,
        });
      });
    }

    return inUseTiers.sort((a, b) => b.basePrice - a.basePrice);
  }, [event]);

  return (
    <div className="flex flex-col h-full bg-primary overflow-y-auto">
      {/* TOOLBAR */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-subtle glass sticky top-0 z-10 flex-shrink-0">
        {view === 'seats' && (
          <button
            onClick={handleBackToMap}
            className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={15} />
            All Sections
          </button>
        )}
        {view === 'seats' && selectedSection && (
          <>
            <span className="text-muted">/</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: selectedSection.color }} />
              <span className="text-sm font-medium text-primary">{selectedSection.name}</span>
              <span className="text-xs text-muted flex items-center gap-1">
                <Users size={10} />
                {selectedSection.availableSeats} available
              </span>
            </div>
          </>
        )}
        {view === 'map' && (
          <span className="text-sm text-secondary">
            Click a section to choose your seats
          </span>
        )}
      </div>

      {/* HERO SECTION */}
      <div ref={heroSectionRef} className="w-full border-b border-subtle flex-shrink-0 relative" style={{ height: '60vh', minHeight: '400px' }}>
        {view === 'map' ? (
          <>
            {/* Full-bleed poster background */}
            <Image
              src="/img/Home%20sweet%20Loan%20Poster.jpeg"
              alt="Event background poster"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            {/* Venue Map on top */}
            <div className="relative z-10 w-full h-full flex items-center justify-center max-w-5xl mx-auto p-6">
              <div className="w-full h-full glass rounded-2xl border border-subtle p-2 shadow-xl relative overflow-hidden">
                <VenueMapCanvas
                  event={event}
                  onSectionSelect={handleSectionSelect}
                  selectedSectionId={selectedSection?.id}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full max-w-7xl mx-auto p-6">
            {/* Seat Grid Picker filling the Hero Section */}
            <div className="w-full h-full glass rounded-2xl border border-subtle shadow-xl relative flex flex-col bg-card overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-subtle flex items-center justify-between bg-secondary">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-sm" style={{ background: selectedSection?.color }} />
                    <span className="font-semibold text-primary">{selectedSection?.name} Seats</span>
                  </div>
                  <button
                    onClick={handleBackToMap}
                    className="text-xs font-semibold px-3 py-1.5 bg-secondary hover:bg-accent hover:text-white text-secondary rounded-lg transition-colors"
                  >
                    Back to Map
                  </button>
                </div>

                {lockError && (
                  <div className="bg-accent/10 border-b border-accent/20 px-6 py-2.5 flex items-center justify-between text-xs text-accent font-medium">
                    <span>{lockError}</span>
                    <button onClick={() => setLockError(null)} className="p-1 hover:text-accent-hover transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Grid */}
                <div className="flex-1 flex flex-col items-center justify-center overflow-hidden p-6 relative">
                  {loadingSeats ? (
                    <div className="flex items-center gap-3 text-secondary">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm">Loading seats…</span>
                    </div>
                  ) : selectedSection ? (
                    <SeatGridPicker
                      section={selectedSection}
                      seats={seats}
                      selectedIds={selectedSeatIds}
                      onToggleSeat={handleToggleSeat}
                      disabledSeatKeys={selectedSection.geometry?.disabledSeats || []}
                      sessionId={sessionId}
                    />
                  ) : null}
                </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM SECTION */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-6 flex gap-8">
        {/* Left: Details */}
        <div className="flex-1 flex flex-col gap-8 text-primary pr-4">
          <div className="glass p-6 rounded-2xl border border-subtle">
            <h2 className="text-lg font-bold mb-3 text-primary">Description</h2>
            <p className="text-sm text-secondary leading-relaxed whitespace-pre-line">
              {event.description ? event.description : (
                <>
                  Experience an unforgettable journey with <strong>{event.title}</strong> at {event.venueName}. 
                  Prepare yourself for a spectacular show packed with mesmerizing visuals and stunning performances!
                  This event is highly anticipated, so make sure to secure your seats quickly.
                </>
              )}
            </p>
          </div>
          
          {activeTiers && activeTiers.length > 0 && (
            <div className="glass p-6 rounded-2xl border border-subtle">
              <h2 className="text-lg font-bold mb-3 text-primary">Pricing Tiers</h2>
              <div className="flex flex-col gap-4">
                {activeTiers.map((tier: any) => {
                  const matchingSections = event.sections.filter(sec => {
                    if (sec.shapeType === 'STAGE') return false;
                    if (event.layout?.pricingTiers && event.layout.pricingTiers.length > 0) {
                      if (tier.id === 'tier-economy-fallback') {
                         return !event.layout.pricingTiers.find((t: any) => t.id === sec.tierId || t.name === sec.tierName);
                      }
                      return sec.tierId === tier.id || sec.tierName === tier.name;
                    } else {
                      return sec.price === tier.basePrice;
                    }
                  });
                  const sectionNames = Array.from(new Set(matchingSections.map(s => s.name))).join(', ');
                  
                  return (
                    <div key={tier.id} className="flex gap-4 items-start border-b border-subtle pb-4 last:border-0 last:pb-0">
                      <div className="w-4 h-4 rounded mt-1 flex-shrink-0" style={{ background: tier.color }} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-primary">{tier.name}</span>
                          <span className="font-mono font-medium text-accent">Rp {tier.basePrice.toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-sm text-secondary mb-1">{tier.description || 'No description available.'}</p>
                        {sectionNames && (
                          <p className="text-xs text-muted mb-2 font-medium">Includes: {sectionNames}</p>
                        )}
                        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                          {tier.salesEndDate ? (
                            <div className="text-xs font-medium px-2 py-1 bg-secondary inline-block rounded border border-subtle">
                              Sales end: {new Date(tier.salesEndDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          ) : <div />}

                          <button
                            onClick={() => {
                              heroSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm flex items-center gap-1 ml-auto"
                          >
                            Order Now
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="glass p-6 rounded-2xl border border-subtle">
            <h2 className="text-lg font-bold mb-3 text-primary">Terms & Conditions</h2>
            {event.termsAndConditions ? (
              <div className="text-sm text-secondary whitespace-pre-line leading-relaxed">
                {event.termsAndConditions}
              </div>
            ) : (
              <ul className="text-sm text-secondary list-disc pl-5 space-y-2">
                <li>Tickets are strictly non-refundable and non-transferable.</li>
                <li>Please arrive at least 30 minutes before the event starts.</li>
                <li>Outside food and drinks are prohibited inside the venue.</li>
                <li>Flash photography is strictly prohibited.</li>
              </ul>
            )}
          </div>
        </div>

        {/* Right: Booking Cart Sidebar */}
        <div className="w-[380px] flex-shrink-0">
          <div className="sticky top-20 border border-subtle bg-secondary rounded-2xl shadow-xl flex flex-col overflow-hidden" style={{ minHeight: '400px' }}>
            <BookingCartSidebar
              sections={event.sections}
              pricingTiers={event.layout?.pricingTiers}
              eventId={event.id}
              termsAndConditions={event.termsAndConditions}
              selectedSeats={selectedSeatObjects}
              onClearSeat={handleClearSeat}
              onBookingComplete={handleBookingComplete}
              userSessionId={sessionId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
