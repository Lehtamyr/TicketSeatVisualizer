'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Layers, Calendar, Plus, Edit3, Play, Loader2, ArrowLeft,
  Info, LayoutGrid, CheckCircle, X, Trash2
} from 'lucide-react';

interface LayoutItem {
  id: string;
  name: string;
  sectionCount: number;
  totalSeats: number;
  updatedAt: string;
}

interface EventItem {
  id: string;
  title: string;
  venueName: string;
  startTime: string;
  sections: { totalSeats: number; availableSeats: number }[];
}

export default function AdminDashboardPage() {
  const [layouts, setLayouts] = useState<LayoutItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingLayouts, setLoadingLayouts] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Event creation form modal state
  const [selectedLayout, setSelectedLayout] = useState<LayoutItem | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [venueName, setVenueName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchLayouts = async () => {
    try {
      const res = await fetch('/api/layouts');
      const data = await res.json();
      if (data.data) {
        // Map backend response layout schema to layout items list
        setLayouts(data.data.map((l: any) => ({
          id: l.id,
          name: l.name,
          sectionCount: l.sections?.length || 0,
          totalSeats: l.sections?.reduce((sum: number, s: any) => sum + (s.seats?.length || 0), 0) || 0,
          updatedAt: l.updatedAt
        })));
      }
    } catch (err) {
      console.error('Failed to fetch layouts:', err);
    } finally {
      setLoadingLayouts(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchLayouts(), fetchEvents()]);
    };
    init();
  }, []);

  const handleDeleteLayout = async (layoutId: string) => {
    if (!confirm('Are you sure you want to delete this layout? This will also delete all associated sections and seats.')) {
      return;
    }
    try {
      const res = await fetch(`/api/layouts?layoutId=${layoutId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchLayouts(); // Refresh layouts list
      } else {
        alert('Failed to delete layout.');
      }
    } catch (err) {
      console.error('Failed to delete layout:', err);
      alert('Failed to delete layout due to a network error.');
    }
  };

  const handleOpenCreateEvent = (layout: LayoutItem) => {
    setSelectedLayout(layout);
    setEventTitle(`${layout.name} Event`);
    setVenueName('Main Arena Stadium');
    // Default to tomorrow same time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    setStartTime(tomorrow.toISOString().slice(0, 16));
    setCreateSuccess(false);
    setCreateError(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLayout) return;

    setCreatingEvent(true);
    setCreateError(null);
    setCreateSuccess(false);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventTitle,
          venueName,
          startTime: new Date(startTime).toISOString(),
          layoutId: selectedLayout.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCreateSuccess(true);
        fetchEvents(); // Refresh events list
        setTimeout(() => {
          setSelectedLayout(null);
        }, 1500);
      } else {
        setCreateError(data.error ?? 'Failed to create event.');
      }
    } catch (err) {
      setCreateError('Network error occurred.');
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090f] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="glass border-b border-white/[0.06] px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={14} />
            Back to Home
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-indigo-400" />
            <h1 className="text-sm font-semibold text-white">Admin Control Dashboard</h1>
          </div>
        </div>

        <Link
          href="/admin/layout-builder"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all"
        >
          <Plus size={13} />
          Create New Layout
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Saved Layouts (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers size={18} className="text-indigo-400" />
              Venue Seat Layouts
            </h2>
            <p className="text-xs text-slate-400 mt-1">Select and manage modular seating layouts or spawn ticket sale events.</p>
          </div>

          {loadingLayouts ? (
            <div className="glass rounded-2xl p-12 flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-400 mr-2" size={20} />
              <span className="text-sm text-slate-400">Loading layouts…</span>
            </div>
          ) : layouts.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center text-slate-500 border border-dashed border-white/10">
              <Layers size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No layouts built yet</p>
              <p className="text-xs mt-1">Click &quot;Create New Layout&quot; above to design your first modular seat layout.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {layouts.map((l) => (
                <div key={l.id} className="glass rounded-2xl p-5 flex flex-col justify-between border border-white/[0.04] hover:border-indigo-500/20 transition-all duration-300 relative group/card">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white truncate flex-1">{l.name}</h3>
                      <button
                        onClick={() => handleDeleteLayout(l.id)}
                        className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors opacity-0 group-hover/card:opacity-100 focus:opacity-100"
                        title="Delete Layout"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Updated {new Date(l.updatedAt).toLocaleDateString()}
                    </p>

                    <div className="mt-4 flex gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Sections</span>
                        <span className="font-semibold text-slate-200">{l.sectionCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Total Seats</span>
                        <span className="font-semibold text-slate-200">{l.totalSeats}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/layout-builder?layoutId=${l.id}`}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 transition-all"
                    >
                      <Edit3 size={11} />
                      Edit Layout
                    </Link>
                    <button
                      onClick={() => handleOpenCreateEvent(l)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-300 transition-all"
                    >
                      <Play size={10} />
                      Create Event
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Side: Active Events (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar size={18} className="text-indigo-400" />
              Active Events
            </h2>
            <p className="text-xs text-slate-400 mt-1">Live ticket sale visualizers created from saved layout templates.</p>
          </div>

          {loadingEvents ? (
            <div className="glass rounded-2xl p-12 flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-400 mr-2" size={20} />
              <span className="text-sm text-slate-400">Loading events…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center text-slate-500 border border-dashed border-white/10">
              <Calendar size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No live events active</p>
              <p className="text-xs mt-1">Use the &quot;Create Event&quot; button next to a layout template to launch one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {events.map((e) => {
                const total = e.sections?.reduce((sum, s) => sum + s.totalSeats, 0) || 0;
                const available = e.sections?.reduce((sum, s) => sum + s.availableSeats, 0) || 0;
                const pct = total > 0 ? Math.round((available / total) * 100) : 0;

                return (
                  <div key={e.id} className="glass rounded-2xl p-4 border border-white/[0.04] flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-semibold text-white truncate">{e.title}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.venueName}</p>
                      <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
                        <span>{new Date(e.startTime).toLocaleDateString()}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/40" />
                        <span>{available} / {total} Available</span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-white/5 rounded-full h-1 mt-2.5 overflow-hidden">
                        <div className="bg-indigo-500 h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <Link
                      href={`/events/${e.id}`}
                      className="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center justify-center flex-shrink-0"
                      aria-label="View visualizer"
                    >
                      <Play size={12} fill="currentColor" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Create Event Dialog Modal */}
      {selectedLayout && (
        <div className="fixed inset-0 bg-[#020306]/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-sm w-full rounded-2xl border border-white/10 shadow-2xl p-6 relative animate-zoom-in">
            <button
              onClick={() => setSelectedLayout(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>

            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <Play size={13} className="text-indigo-400" />
              Create Event From Layout
            </h3>
            <p className="text-[11px] text-slate-400 mb-6">
              Launch a live event visualizer using <span className="font-semibold text-slate-200">{selectedLayout.name}</span>.
            </p>

            <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Event Title</label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/40 transition-all"
                  placeholder="Taylor Swift - Eras Tour"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Venue name</label>
                <input
                  type="text"
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/40 transition-all"
                  placeholder="Staples Center Stadium"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/40 transition-all"
                />
              </div>

              {createError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-[10px] text-red-400 mt-2">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-[10px] text-emerald-400 mt-2 flex items-center gap-1">
                  <CheckCircle size={10} />
                  Event created successfully!
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLayout(null)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingEvent || createSuccess}
                  className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {creatingEvent && <Loader2 size={10} className="animate-spin" />}
                  {creatingEvent ? 'Creating…' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
