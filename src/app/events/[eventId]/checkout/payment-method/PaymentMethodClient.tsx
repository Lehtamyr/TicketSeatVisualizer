'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Ticket,
  Clock,
  ArrowLeft,
  ChevronRight,
  QrCode,
  Building,
  CheckCircle,
  Info,
  ChevronLeft,
} from 'lucide-react';
import { CheckoutJourneyTracker } from '@/components/checkout/CheckoutJourneyTracker';

interface BookedSeatInfo {
  seatId: string;
  row: string;
  number: number;
  sectionName: string;
  sectionColor?: string;
  tierName?: string;
  price: number;
}

interface PaymentMethodClientProps {
  event: {
    id: string;
    title: string;
    venueName: string;
    startTime: string;
  };
  reservationId: string;
  bookedSeats: BookedSeatInfo[];
  totalAmount: number;
  expiresAtIso: string;
}

type PaymentMethodType = 'QRIS' | 'BANK_JAKARTA_VA';

export function PaymentMethodClient({
  event,
  reservationId,
  bookedSeats,
  totalAmount,
  expiresAtIso,
}: PaymentMethodClientProps) {
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('QRIS');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 5-Minute Timer Countdown State
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const remainingSecs = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
    return remainingSecs > 0 ? remainingSecs : 0;
  });
  const [isExpired, setIsExpired] = useState<boolean>(timeLeft <= 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isUrgent = timeLeft < 60;

  const paymentOptions = [
    {
      id: 'QRIS' as PaymentMethodType,
      title: 'QRIS (Gopay / OVO / Dana / LinkAja / All M-Banking)',
      icon: <QrCode size={20} className="text-red-600" />,
      desc: 'Scan QRIS otomatis dengan seluruh dompet digital dan aplikasi mobile banking',
      badgeColor: 'bg-red-600 text-white',
      badgeText: 'QRIS STANDAR',
    },
    {
      id: 'BANK_JAKARTA_VA' as PaymentMethodType,
      title: 'Bank Jakarta / Bank DKI Virtual Account',
      icon: <Building size={20} className="text-orange-600" />,
      desc: 'Nomor Virtual Account resmi Bank DKI untuk transfer via JakOne Mobile & ATM',
      badgeColor: 'bg-orange-600 text-white',
      badgeText: 'BANK DKI / JAKARTA',
    },
  ];

  const handleContinueClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmAndProceed = () => {
    setShowConfirmModal(false);
    router.push(
      `/events/${event.id}/checkout/confirmation?reservationId=${reservationId}&method=${selectedMethod}`
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-primary text-primary">
      {/* Top Navbar */}
      <header className="glass border-b border-subtle px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${event.id}/checkout?reservationId=${reservationId}`}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Kembali ke Data Pembeli</span>
          </Link>
          <div className="h-4 w-px bg-subtle hidden sm:block" />
          <h1 className="text-sm font-semibold text-primary hidden sm:block truncate max-w-xs">
            {event.title}
          </h1>
        </div>

        <div className="text-xs text-secondary font-mono">
          Checkout ID: <span className="text-accent font-semibold">{reservationId.slice(0, 8).toUpperCase()}</span>
        </div>
      </header>

      {/* Persistent 4-Step Journey Tracker (Step 2: Informasi - Part B Metode Pembayaran) */}
      <CheckoutJourneyTracker currentStep={2} subStep="PAYMENT_METHOD" />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Sticky Countdown Timer */}
        <div className="w-full sticky top-[60px] z-30 pb-2">
          <div
            className={`w-full py-3.5 px-6 rounded-2xl border-2 flex items-center justify-center gap-3 shadow-md backdrop-blur-md transition-all ${
              isUrgent
                ? 'bg-red-50 border-red-500 text-red-600 animate-pulse'
                : 'bg-white border-accent/40 text-primary shadow-blue-100'
            }`}
          >
            <div className={`p-1.5 rounded-full ${isUrgent ? 'bg-red-100 text-red-600' : 'bg-accent/10 text-accent'}`}>
              <Clock size={16} />
            </div>
            <span className="text-xs sm:text-sm font-medium text-secondary">
              Pilih metode pembayaran sebelum waktu habis:
            </span>
            <span className={`text-base sm:text-lg font-mono font-bold ${isUrgent ? 'text-red-600' : 'text-accent'}`}>
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Payment Method Options */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border-2 border-subtle p-6 shadow-md flex flex-col gap-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-subtle">
                <div className="p-2 rounded-xl bg-accent/10 text-accent">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-primary">Pilih Metode Pembayaran</h2>
                  <p className="text-xs text-secondary">Pilih salah satu metode pembayaran di bawah</p>
                </div>
              </div>

              <div className="flex flex-col gap-3.5 mt-1">
                {paymentOptions.map((opt) => {
                  const isSelected = selectedMethod === opt.id;
                  return (
                    <label
                      key={opt.id}
                      onClick={() => setSelectedMethod(opt.id)}
                      className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50/70 border-accent ring-2 ring-accent shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-secondary hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethodOption"
                        value={opt.id}
                        checked={isSelected}
                        onChange={() => setSelectedMethod(opt.id)}
                        className="accent-accent mt-1 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            {opt.icon}
                            <span className="text-xs sm:text-sm font-bold text-primary">{opt.title}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>
                            {opt.badgeText}
                          </span>
                        </div>
                        <p className="text-xs text-secondary leading-relaxed">{opt.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Order Summary + Action Buttons */}
          <div className="lg:col-span-5 sticky top-[148px] flex flex-col gap-4">
            <div className="bg-white rounded-2xl border-2 border-subtle p-6 shadow-md">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-subtle">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
                    <Ticket size={16} />
                  </div>
                  <h3 className="text-sm font-bold text-primary">Ringkasan Pesanan</h3>
                </div>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {bookedSeats.length} Kursi
                </span>
              </div>

              {/* Event Info */}
              <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <h4 className="text-sm font-bold text-primary mb-0.5">{event.title}</h4>
                <p className="text-xs text-secondary mb-1">{event.venueName}</p>
                <p className="text-xs text-accent font-mono font-semibold">
                  {new Date(event.startTime).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* Seat List */}
              <div className="border-t border-subtle pt-3 mb-4 flex flex-col gap-2 max-h-56 overflow-y-auto">
                {bookedSeats.map((s) => (
                  <div
                    key={s.seatId}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: s.sectionColor || '#38bdf8' }}
                      />
                      <div>
                        <p className="text-xs font-bold text-primary">
                          {s.sectionName} · Row {s.row} - #{s.number}
                        </p>
                        <p className="text-[10px] text-secondary font-mono">{s.tierName}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-primary px-2 py-0.5 bg-white border border-slate-200 rounded-lg">
                      Rp {s.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Price Calculations */}
              <div className="border-t border-subtle pt-3 flex flex-col gap-2 text-xs">
                <div className="flex justify-between text-secondary">
                  <span>Subtotal Tiket ({bookedSeats.length})</span>
                  <span className="font-mono text-primary font-semibold">Rp {totalAmount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Biaya Layanan & Pajak</span>
                  <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                    Rp 0 (Termasuk)
                  </span>
                </div>
                <div className="border-t-2 border-slate-200 pt-3 mt-1 flex justify-between items-center bg-blue-50/50 p-3 rounded-xl">
                  <span className="text-sm font-bold text-primary">Total Tagihan</span>
                  <span className="text-lg font-bold font-mono text-accent">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => router.push(`/events/${event.id}/checkout?reservationId=${reservationId}`)}
                  className="py-3 px-4 rounded-xl border border-slate-300 text-xs font-bold text-secondary hover:bg-slate-50 transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  <ChevronLeft size={15} />
                  <span>Kembali</span>
                </button>

                <button
                  type="button"
                  onClick={handleContinueClick}
                  disabled={isExpired}
                  className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Lanjutkan</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-subtle text-xs text-secondary flex items-start gap-2.5 shadow-sm">
              <Info size={16} className="shrink-0 mt-0.5 text-accent" />
              <p className="leading-relaxed">
                Pilihan metode pembayaran dapat diperiksa kembali pada halaman konfirmasi sebelum pembayaran diproses.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-primary animate-zoom-in">
            <h3 className="text-base font-bold text-primary mb-1 flex items-center gap-2">
              <CheckCircle size={18} className="text-accent" />
              Konfirmasi Pilihan Pembayaran
            </h3>
            <p className="text-xs text-secondary mb-4">
              Anda akan diarahkan ke halaman rangkuman dan konfirmasi pesanan dengan metode pembayaran berikut:
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 text-xs flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-secondary">Metode Terpilih:</span>
                <span className="font-bold text-primary">
                  {paymentOptions.find((p) => p.id === selectedMethod)?.title}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-secondary">Total Tagihan:</span>
                <span className="font-mono font-bold text-accent">
                  Rp {totalAmount.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-secondary hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Ubah Pilihan
              </button>
              <button
                type="button"
                onClick={handleConfirmAndProceed}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Ya, Lanjutkan</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Timer Expired Modal */}
      {isExpired && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-7 max-w-md w-full shadow-2xl text-center text-primary animate-zoom-in">
            <div className="w-14 h-14 rounded-full bg-rose-100 border-2 border-rose-300 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Clock size={28} />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Waktu Pemesanan Telah Habis</h3>
            <p className="text-xs text-secondary mb-6 leading-relaxed">
              Batas waktu pemilihan metode pembayaran telah berakhir. Kursi Anda telah dilepaskan kembali ke publik.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/events/${event.id}`)}
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              Pilih Kursi Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
