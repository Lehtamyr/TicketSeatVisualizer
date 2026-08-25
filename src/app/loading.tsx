import React from 'react';

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center gap-4 text-primary animate-fadeIn">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-primary">Memuat Halaman…</p>
        <p className="text-xs text-secondary">Mohon tunggu sebentar</p>
      </div>
    </div>
  );
}
