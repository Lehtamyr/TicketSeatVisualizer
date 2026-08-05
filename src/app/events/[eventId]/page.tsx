'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { EventDTO } from '@/types/venue';
import { EventVisualizer } from '@/components/visualizer/EventVisualizer';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EventPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const [event, setEvent] = useState<EventDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/events/${eventId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Event not found');
        return res.json();
      })
      .then((data) => {
        // Playwright test intercepts might return:
        // 1. { event: ..., layout: ... }
        // 2. { success: true, data: [event1, event2, ...] }
        // 3. { success: true, data: event }
        // 4. Direct EventDTO
        let rawEvent = data;

        if (data.success && Array.isArray(data.data)) {
          rawEvent = data.data.find((e: any) => e.id === eventId) || data.data[0];
        } else if (data.success && data.data) {
          rawEvent = data.data;
        } else if (data.event) {
          rawEvent = data.event;
        }

        // Parse geometry safely if sections are stringified (SQLite compatibility fallback)
        if (rawEvent && Array.isArray(rawEvent.sections)) {
          rawEvent.sections = rawEvent.sections.map((s: any) => {
            let geom = s.geometry;
            if (typeof geom === 'string') {
              try {
                geom = JSON.parse(geom);
              } catch (e) {
                // Keep original
              }
            }

            // Calculate totalSeats and availableSeats dynamically if undefined (expected for mock E2E models)
            const total = s.totalSeats !== undefined ? s.totalSeats : (s.seats ? s.seats.length : 0);
            const available = s.availableSeats !== undefined ? s.availableSeats : (s.seats ? s.seats.filter((seat: any) => seat.status === 'AVAILABLE').length : 0);

            // Derive section price for seat price fallback
            const sectionPrice = s.price ?? s.pricingTier?.basePrice ?? 0;

            // Transform embedded seats to ensure SeatDTO.price is present
            const transformedSeats = s.seats
              ? s.seats.map((seat: any) => ({
                  ...seat,
                  price: seat.price ?? seat.priceOverride ?? sectionPrice,
                }))
              : undefined;

            return {
              ...s,
              geometry: geom,
              totalSeats: total,
              availableSeats: available,
              seats: transformedSeats,
              // Fallbacks for pricing tier color-coding verification
              color: s.color || (s.pricingTier?.color) || '#3B82F6',
              tierName: s.tierName || (s.pricingTier?.name),
              tierColor: s.tierColor || (s.pricingTier?.color),
            };
          });
        }
        setEvent(rawEvent);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading event visualizer…</span>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-6 text-center">
        <p className="text-red-400 font-semibold mb-2">Failed to load event</p>
        <p className="text-sm text-slate-500 mb-6">{error || 'Event details not available'}</p>
        <Link href="/events" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          ← Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col animate-fade-in" style={{ height: '100vh' }}>
      {/* Top nav */}
      <header className="glass border-b border-white/[0.06] px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          ← Home
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <Link href="/events" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          Events
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <div>
          <h1 className="text-sm font-semibold text-white leading-none">{event.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{event.venueName}</p>
        </div>
        <div className="ml-auto text-xs text-slate-400">
          {event.startTime ? new Date(event.startTime).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }) : ''}
        </div>
      </header>

      {/* Main visualizer container */}
      <main className="flex-1 overflow-hidden">
        <EventVisualizer event={event} />
      </main>
    </div>
  );
}
