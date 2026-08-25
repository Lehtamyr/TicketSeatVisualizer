'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShieldCheck,
  Ticket,
  Clock,
  ArrowLeft,
  ChevronRight,
  QrCode,
  Building,
  User,
  MapPin,
  Calendar,
  ChevronLeft,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { CheckoutJourneyTracker } from '@/components/checkout/CheckoutJourneyTracker';
import { getStoredBuyerInfo } from '@/lib/buyerStorage';

interface BookedSeatInfo {
  seatId: string;
  row: string;
  number: number;
  sectionName: string;
  sectionColor?: string;
  tierName?: string;
  price: number;
}

interface ConfirmationClientProps {
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
  paymentMethod: string;
}

export function ConfirmationClient({
  event,
  reservationId,
  bookedSeats,
  totalAmount,
  expiresAtIso,
  paymentMethod,
}: ConfirmationClientProps) {
  const router = useRouter();
  const [buyerInfo] = useState(() => getStoredBuyerInfo());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const getMethodDetails = () => {
    switch (paymentMethod) {
      case 'BANK_JAKARTA_VA':
        return {
          title: 'Bank Jakarta / Bank DKI Virtual Account',
          icon: <Building size={20} className="text-orange-600" />,
          badgeColor: 'bg-orange-600 text-white',
          desc: 'Transfer via JakOne Mobile, ATM Bank DKI, atau transfer antar bank.',
        };
      case 'BCA_VA':
        return {
          title: 'BCA Virtual Account',
          icon: <Building size={20} className="text-blue-600" />,
          badgeColor: 'bg-blue-600 text-white',
          desc: 'Transfer via BCA Mobile, myBCA, KlikBCA, atau ATM BCA.',
        };
      case 'QRIS':
      default:
        return {
          title: 'QRIS (Gopay / OVO / Dana / BCA / LinkAja)',
          icon: <QrCode size={20} className="text-red-600" />,
          badgeColor: 'bg-red-600 text-white',
          desc: 'Scan QR Code menggunakan seluruh aplikasi dompet digital & mobile banking.',
        };
    }
  };

  const methodDetails = getMethodDetails();

  const handleProceedToPayment = () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Redirect to Step 4: Payment Instructions & Mock Execution
    router.push(
      `/events/${event.id}/checkout/payment?reservationId=${reservationId}&method=${paymentMethod}`
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-primary text-primary">
      {/* Top Navbar */}
      <header className="glass border-b border-subtle px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${event.id}/checkout/payment-method?reservationId=${reservationId}`}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Kembali ke Metode Pembayaran</span>
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

      {/* Persistent 4-Step Journey Tracker (Step 3: Konfirmasi Pesanan) */}
      <CheckoutJourneyTracker currentStep={3} />

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
              Selesaikan konfirmasi sebelum batas waktu:
            </span>
            <span className={`text-base sm:text-lg font-mono font-bold ${isUrgent ? 'text-red-600' : 'text-accent'}`}>
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Event Banner, Buyer Details & Selected Payment Method */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Section 1: Event Hero Card */}
            <div className="bg-white rounded-2xl border-2 border-subtle overflow-hidden shadow-md">
              <div className="relative h-48 w-full bg-slate-900">
                <Image
                  src="/img/Home%20sweet%20Loan%20Poster.jpeg"
                  alt={event.title}
                  fill
                  className="object-cover opacity-85"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-accent text-white inline-block mb-1.5 shadow">
                    Official Event
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold drop-shadow">{event.title}</h2>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-accent">
                    <MapPin size={15} />
                  </div>
                  <span>{event.venueName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-accent">
                    <Calendar size={15} />
                  </div>
                  <span className="font-mono">
                    {new Date(event.startTime).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Buyer Information Summary */}
            <div className="bg-white rounded-2xl border-2 border-subtle p-6 shadow-md flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent/10 text-accent">
                    <User size={18} />
                  </div>
                  <h3 className="text-base font-bold text-primary">Informasi Pembeli</h3>
                </div>
                <Link
                  href={`/events/${event.id}/checkout?reservationId=${reservationId}`}
                  className="text-xs text-accent hover:underline font-bold"
                >
                  Ubah Data
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-secondary block mb-0.5 font-medium">Nama Lengkap</span>
                  <span className="font-bold text-primary">
                    {buyerInfo ? `${buyerInfo.firstName} ${buyerInfo.lastName}` : '-'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-secondary block mb-0.5 font-medium">Alamat Email</span>
                  <span className="font-bold text-primary truncate block">
                    {buyerInfo?.email || '-'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-secondary font-medium">Nomor Identitas</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {buyerInfo?.identityType || 'KTP'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-primary">
                    {buyerInfo?.identityNumber || '-'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-secondary block mb-0.5 font-medium">Nomor Telepon / WhatsApp</span>
                  <span className="font-mono font-bold text-primary">
                    {buyerInfo ? `${buyerInfo.dialCode} ${buyerInfo.phoneNumber}` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: Selected Payment Method Summary */}
            <div className="bg-white rounded-2xl border-2 border-subtle p-6 shadow-md flex flex-col gap-3">
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent/10 text-accent">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="text-base font-bold text-primary">Metode Pembayaran Terpilih</h3>
                </div>
                <Link
                  href={`/events/${event.id}/checkout/payment-method?reservationId=${reservationId}`}
                  className="text-xs text-accent hover:underline font-bold"
                >
                  Ubah Metode
                </Link>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  {methodDetails.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-primary">{methodDetails.title}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${methodDetails.badgeColor}`}>
                      Terpilih
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">{methodDetails.desc}</p>
                </div>
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

              {/* Seat List */}
              <div className="mb-4 flex flex-col gap-2 max-h-56 overflow-y-auto">
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

              {submitError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/events/${event.id}/checkout/payment-method?reservationId=${reservationId}`
                    )
                  }
                  className="py-3 px-4 rounded-xl border border-slate-300 text-xs font-bold text-secondary hover:bg-slate-50 transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  <ChevronLeft size={15} />
                  <span>Ubah</span>
                </button>

                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={isSubmitting || isExpired}
                  className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span>Memproses...</span>
                  ) : (
                    <>
                      <span>Bayar Sekarang</span>
                      <ChevronRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-subtle text-xs text-secondary flex items-start gap-2.5 shadow-sm">
              <Info size={16} className="shrink-0 mt-0.5 text-accent" />
              <p className="leading-relaxed">
                Pastikan data identitas pembeli sudah benar. Data tidak dapat diubah setelah pembayaran berhasil diselesaikan.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal: Timer Expired Modal */}
      {isExpired && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-7 max-w-md w-full shadow-2xl text-center text-primary animate-zoom-in">
            <div className="w-14 h-14 rounded-full bg-rose-100 border-2 border-rose-300 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Clock size={28} />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Waktu Pemesanan Telah Habis</h3>
            <p className="text-xs text-secondary mb-6 leading-relaxed">
              Batas waktu konfirmasi pesanan telah berakhir. Kursi Anda telah dilepaskan kembali ke publik.
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
