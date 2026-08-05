import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminCanvasWorkspace } from '@/components/admin/AdminCanvasWorkspace';
import Link from 'next/link';
import { ArrowLeft, Layers, Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin Layout Builder — Venue Seat Visualizer',
  description: 'Draw and manage modular venue section shapes with seat auto-generation.',
};

export default function AdminLayoutBuilderPage() {
  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <header className="glass border-b border-white/[0.06] px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} />
          Home
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-indigo-400" />
          <h1 className="text-sm font-semibold text-white">Venue Layout Builder</h1>
        </div>
        <p className="text-xs text-slate-500 ml-2">Draw sections → Configure → Save to Database</p>
      </header>
      <main className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="h-full flex items-center justify-center bg-[#07090f] text-slate-400 gap-2">
            <Loader2 className="animate-spin text-indigo-400" size={16} />
            <span className="text-sm">Loading workspace…</span>
          </div>
        }>
          <AdminCanvasWorkspace />
        </Suspense>
      </main>
    </div>
  );
}
