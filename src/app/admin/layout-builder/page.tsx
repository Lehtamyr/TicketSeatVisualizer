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
      <header className="glass border-b border-subtle px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-secondary hover:text-primary transition-colors text-sm">
          <ArrowLeft size={14} />
          Home
        </Link>
        <div className="h-4 w-px hover:bg-accent hover:text-white" />
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-accent" />
          <h1 className="text-sm font-semibold text-primary">Venue Layout Builder</h1>
        </div>
        <p className="text-xs text-muted ml-2">Draw sections → Configure → Save to Database</p>
      </header>
      <main className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="h-full flex items-center justify-center bg-primary text-secondary gap-2">
            <Loader2 className="animate-spin text-accent" size={16} />
            <span className="text-sm">Loading workspace…</span>
          </div>
        }>
          <AdminCanvasWorkspace />
        </Suspense>
      </main>
    </div>
  );
}
