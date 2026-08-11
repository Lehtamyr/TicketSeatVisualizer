import React from 'react';
import Link from 'next/link';
import { getEvents } from '@/actions/getEvents';
import { Calendar, MapPin, ChevronRight, Ticket } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const events = await getEvents();

  return (
    <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <div className="mb-10 animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm mb-4">
          ← Back to Home
        </Link>
        <h1 className="text-4xl font-bold gradient-text mb-2">Live Events</h1>
        <p className="text-slate-400">Select an event to choose your seats</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-24 text-slate-500">
          <Ticket size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg">No events available</p>
          <p className="text-sm mt-1">Check back later or seed the database</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {events.map((event, i) => {
            const totalSeats = event.sections.reduce((s, sec) => s + sec.totalSeats, 0);
            const availableSeats = event.sections.reduce((s, sec) => s + sec.availableSeats, 0);
            const pct = totalSeats > 0 ? Math.round((availableSeats / totalSeats) * 100) : 0;

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="glass rounded-2xl p-6 hover:border-indigo-500/40 transition-all duration-300 group block"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {event.title}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-1.5 text-slate-400 text-sm">
                      <MapPin size={12} />
                      <span className="truncate">{event.venueName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-slate-400 text-sm">
                      <Calendar size={12} />
                      <span>{new Date(event.startTime).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-500 group-hover:text-indigo-400 transition-colors mt-1 flex-shrink-0" />
                </div>

                <div className="mt-5">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-slate-400">Availability</span>
                    <span className={`text-xs font-semibold ${pct < 20 ? 'text-red-400' : pct < 50 ? 'text-amber-400' : 'text-cyan-400'}`}>
                      {availableSeats.toLocaleString()} / {totalSeats.toLocaleString()} seats
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22d3ee',
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {event.sections.filter((sec) => sec.shapeType !== 'STAGE' && sec.geometry?.shapeType !== 'STAGE').slice(0, 5).map((sec) => (
                    <span key={sec.id}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${sec.color}25`, color: sec.color, border: `1px solid ${sec.color}40` }}>
                      {sec.code}
                    </span>
                  ))}
                  {event.sections.filter((sec) => sec.shapeType !== 'STAGE' && sec.geometry?.shapeType !== 'STAGE').length > 5 && (
                    <span className="text-xs text-slate-500">+{event.sections.filter((sec) => sec.shapeType !== 'STAGE' && sec.geometry?.shapeType !== 'STAGE').length - 5} more</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
