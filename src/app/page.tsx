import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Ticket, Layers, ArrowRight, Zap, Shield, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Venue Seat Visualizer — Dynamic Modular Seating',
  description: 'Interactive venue seating with modular geometric sections, real-time availability, and admin layout builder.',
};

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, #22d3ee, transparent)' }} />
      </div>

      <div className="relative z-10 text-center max-w-3xl animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-8 tracking-wide">
          <Zap size={10} />
          Dynamic Modular Venue Seating
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
          <span className="gradient-text">Pick Your Perfect</span>
          <br />
          <span className="text-white">Seat</span>
        </h1>

        <p className="text-slate-400 text-lg mb-12 max-w-xl mx-auto leading-relaxed">
          Interactive venue maps with custom geometric sections — rectangles, triangles, polygons —
          each with real-time seat availability and instant booking.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/events"
            className="flex items-center gap-2.5 px-8 py-4 rounded-2xl font-semibold text-white text-sm transition-all duration-200
              bg-indigo-600 hover:bg-indigo-500 glow-accent"
          >
            <Ticket size={16} />
            Browse Events
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-8 py-4 rounded-2xl font-semibold text-slate-200 text-sm transition-all duration-200
              glass hover:border-indigo-500/30"
          >
            <Layers size={16} />
            Admin Dashboard
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
          {[
            {
              icon: Globe,
              title: 'Modular Shapes',
              desc: 'Sections defined as rectangles, squares, triangles, or any custom polygon.',
            },
            {
              icon: Zap,
              title: 'Auto Seat Generation',
              desc: 'Point-in-polygon algorithm places seats precisely inside any geometric boundary.',
            },
            {
              icon: Shield,
              title: 'Atomic Booking',
              desc: 'PostgreSQL SELECT FOR UPDATE prevents double-booking under heavy concurrency.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center mb-4">
                <Icon size={16} className="text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1.5">{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
