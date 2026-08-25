'use client';

import React from 'react';
import { Check } from 'lucide-react';

export type CheckoutStep = 1 | 2 | 3 | 4;
export type CheckoutSubStep = 'BUYER_INFO' | 'PAYMENT_METHOD';

interface CheckoutJourneyTrackerProps {
  currentStep: CheckoutStep;
  subStep?: CheckoutSubStep;
}

export function CheckoutJourneyTracker({ currentStep, subStep }: CheckoutJourneyTrackerProps) {
  const steps = [
    {
      id: 1,
      title: 'Pilih Kursi',
    },
    {
      id: 2,
      title: 'Informasi',
      subtitle:
        subStep === 'PAYMENT_METHOD' && currentStep === 2
          ? 'Metode Pembayaran'
          : currentStep === 2
            ? 'Data Pembeli'
            : undefined,
    },
    {
      id: 3,
      title: 'Konfirmasi',
    },
    {
      id: 4,
      title: 'Pembayaran',
    },
  ];

  // Progress width calculation: 4 steps -> (currentStep - 1) / 3 * 100%
  const progressPercent = Math.min(100, Math.max(0, ((currentStep - 1) / 3) * 100));

  return (
    <div className="w-full bg-secondary border-b border-subtle py-3 px-4 sm:px-6 sticky top-0 z-40">
      <div className="max-w-3xl mx-auto relative flex items-center justify-between">
        {/* Continuous Solid Background Track Line */}
        <div className="absolute left-[16px] right-[16px] sm:left-[20px] sm:right-[20px] top-[14px] sm:top-[16px] h-[3px] bg-slate-200 z-0 rounded-full" />

        {/* Continuous Solid Active Progress Line */}
        <div
          className="absolute left-[16px] sm:left-[20px] top-[14px] sm:top-[16px] h-[3px] bg-accent z-0 transition-all duration-500 rounded-full"
          style={{
            width: `calc(${progressPercent}% * (1 - 32px / 100%))`,
            maxWidth: 'calc(100% - 32px)',
          }}
        />

        {steps.map((s) => {
          const isCompleted = currentStep > s.id;
          const isCurrent = currentStep === s.id;

          return (
            <div key={s.id} className="flex flex-col items-center gap-1.5 z-10 select-none">
              {/* Circular Node with solid ring isolation */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ring-4 ring-secondary ${
                  isCompleted
                    ? 'bg-accent text-white shadow-sm'
                    : isCurrent
                      ? 'bg-accent text-white ring-accent/30 shadow-md'
                      : 'bg-white border-2 border-slate-300 text-secondary'
                }`}
              >
                {isCompleted ? <Check size={14} className="stroke-[3]" /> : s.id}
              </div>

              {/* Title & Subtitle */}
              <div className="flex flex-col items-center text-center">
                <span
                  className={`text-[11px] sm:text-xs font-semibold leading-tight ${
                    isCurrent
                      ? 'text-accent font-bold'
                      : isCompleted
                        ? 'text-primary'
                        : 'text-secondary'
                  }`}
                >
                  {s.title}
                </span>
                {s.subtitle && (
                  <span className="text-[9px] sm:text-[10px] text-accent font-medium mt-0.5 whitespace-nowrap">
                    {s.subtitle}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
