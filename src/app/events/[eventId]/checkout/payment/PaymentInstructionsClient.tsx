'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Ticket,
  Clock,
  ArrowLeft,
  QrCode,
  Building,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
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

interface PaymentInstructionsClientProps {
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

export function PaymentInstructionsClient({
  event,
  reservationId,
  bookedSeats,
  totalAmount,
  expiresAtIso,
  paymentMethod,
}: PaymentInstructionsClientProps) {
  const router = useRouter();
  const [buyerInfo] = useState(() => getStoredBuyerInfo());
  const [isCopied, setIsCopied] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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

  // Mock Virtual Account Number generator
  const vaPrefix = paymentMethod === 'BANK_JAKARTA_VA' ? '8801' : '8077';
  const vaNumber = `${vaPrefix} ${reservationId.replace(/\D/g, '').padEnd(12, '8').slice(0, 12).replace(/(\d{4})/g, '$1 ').trim()}`;

  const handleCopyVa = () => {
    navigator.clipboard.writeText(vaNumber.replace(/\s/g, ''));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSimulatePaymentSuccess = async () => {
    setIsSimulating(true);
    setPaymentError(null);

    try {
      // Execute backend booking confirmation
      const res = await fetch('/api/reservations/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId,
          buyerInfo,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (res.ok && (data.success || data.data)) {
        if (timerRef.current) clearInterval(timerRef.current);
        setShowSuccessModal(true);
      } else {
        setPaymentError(data.error || 'Gagal memverifikasi status pembayaran.');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Terjadi kesalahan saat memverifikasi pembayaran.');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-primary text-primary">
      {/* Top Navbar */}
      <header className="glass border-b border-subtle px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${event.id}/checkout/confirmation?reservationId=${reservationId}&method=${paymentMethod}`}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Kembali ke Konfirmasi</span>
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

      {/* Persistent 4-Step Journey Tracker (Step 4: Pembayaran) */}
      <CheckoutJourneyTracker currentStep={4} />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Sticky Countdown Timer */}
        <div className="w-full sticky top-[60px] z-30 pb-2">
          <div
            className={`w-full py-3 px-6 rounded-2xl border flex items-center justify-center gap-3 shadow-lg backdrop-blur-md transition-all ${
              isUrgent
                ? 'bg-red-500/15 border-red-500/50 text-red-400 animate-pulse'
                : 'glass-elevated bg-secondary/95 border-subtle text-primary shadow-slate-200/50'
            }`}
          >
            <Clock size={18} className={isUrgent ? 'text-red-400' : 'text-accent'} />
            <span className="text-xs sm:text-sm font-medium text-secondary">
              Selesaikan pembayaran sebelum batas waktu berakhir:
            </span>
            <span className={`text-base sm:text-lg font-mono font-bold ${isUrgent ? 'text-red-400' : 'text-accent'}`}>
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Payment Instructions */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {paymentMethod === 'QRIS' ? (
              /* QRIS View */
              <div className="glass-elevated rounded-2xl border border-subtle p-6 shadow-md flex flex-col items-center text-center gap-4">
                <div className="flex items-center gap-2 pb-2">
                  <QrCode size={20} className="text-accent" />
                  <h2 className="text-base font-bold text-primary">Pembayaran QRIS Standar Nasional</h2>
                </div>
                <p className="text-xs text-secondary max-w-md">
                  Buka aplikasi mobile banking atau e-wallet pilihan Anda (BCA, Mandiri, GoPay, OVO, Dana, ShopeePay, dll), lalu scan kode QR di bawah:
                </p>

                {/* Mock QR Code Canvas Display */}
                <div className="p-4 bg-white border-2 border-dashed border-accent/40 rounded-2xl shadow-md my-2 flex flex-col items-center">
                  <div className="w-52 h-52 bg-slate-950 rounded-xl p-2.5 flex items-center justify-center relative shadow-inner">
                    {/* Visual QR Pattern Simulation */}
                    <div className="w-full h-full border-4 border-white flex flex-col justify-between p-2">
                      <div className="flex justify-between">
                        <div className="w-10 h-10 border-4 border-white bg-slate-950 flex items-center justify-center">
                          <div className="w-4 h-4 bg-white" />
                        </div>
                        <div className="w-10 h-10 border-4 border-white bg-slate-950 flex items-center justify-center">
                          <div className="w-4 h-4 bg-white" />
                        </div>
                      </div>
                      <div className="text-center font-mono text-[9px] text-white tracking-widest font-bold">
                        TSV · QRIS PAY
                      </div>
                      <div className="flex justify-between">
                        <div className="w-10 h-10 border-4 border-white bg-slate-950 flex items-center justify-center">
                          <div className="w-4 h-4 bg-white" />
                        </div>
                        <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center text-[8px] font-bold text-white">
                          QR
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold font-mono text-slate-800 mt-2">
                    NMID: ID102000000{reservationId.slice(0, 5).toUpperCase()}
                  </span>
                </div>

                <div className="w-full bg-primary border border-subtle rounded-xl p-3.5 text-xs text-secondary flex flex-col gap-1.5 text-left">
                  <span className="font-semibold text-primary">Petunjuk Pembayaran QRIS:</span>
                  <ol className="list-decimal list-inside space-y-1 text-[11px]">
                    <li>Buka aplikasi e-wallet atau Mobile Banking yang mendukung QRIS.</li>
                    <li>Pilih menu <strong>Scan / Bayar</strong> dan arahkan kamera ke QR code di atas.</li>
                    <li>Periksa nama merchant (<strong>TicketSeat Visualizer</strong>) dan total tagihan (<strong>Rp {totalAmount.toLocaleString('id-ID')}</strong>).</li>
                    <li>Masukkan PIN Anda untuk menyelesaikan transaksi.</li>
                  </ol>
                </div>
              </div>
            ) : (
              /* Virtual Account View (Bank Jakarta / BCA) */
              <div className="glass-elevated rounded-2xl border border-subtle p-6 shadow-md flex flex-col gap-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-subtle">
                  <Building size={20} className="text-accent" />
                  <div>
                    <h2 className="text-base font-bold text-primary">
                      {paymentMethod === 'BANK_JAKARTA_VA' ? 'Bank Jakarta / Bank DKI Virtual Account' : 'BCA Virtual Account'}
                    </h2>
                    <p className="text-xs text-secondary mt-0.5">Transfer sebelum batas waktu habis</p>
                  </div>
                </div>

                {/* VA Number Card */}
                <div className="bg-primary border border-subtle rounded-2xl p-5 flex flex-col gap-2">
                  <span className="text-xs text-secondary font-medium">Nomor Virtual Account</span>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl sm:text-2xl font-bold font-mono text-accent tracking-wider">
                      {vaNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyVa}
                      className="py-2 px-3 rounded-xl bg-secondary border border-subtle text-xs font-semibold text-primary hover:border-accent transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <div className="border-t border-subtle pt-2 mt-1 flex justify-between text-xs">
                    <span className="text-secondary">Atas Nama</span>
                    <span className="font-semibold text-primary">
                      TSV · {buyerInfo?.firstName ? `${buyerInfo.firstName} ${buyerInfo.lastName}`.toUpperCase() : 'PEMESAN TIKET'}
                    </span>
                  </div>
                </div>

                {/* Transfer Steps */}
                <div className="bg-secondary border border-subtle rounded-xl p-4 text-xs flex flex-col gap-2">
                  <span className="font-bold text-primary">Cara Pembayaran:</span>
                  <div className="text-secondary leading-relaxed space-y-1.5 text-[11px]">
                    <p>1. Buka aplikasi Mobile Banking atau ATM bank Anda.</p>
                    <p>2. Pilih menu <strong>Transfer &gt; Virtual Account</strong>.</p>
                    <p>3. Masukkan nomor VA <strong>{vaNumber}</strong>.</p>
                    <p>4. Konfirmasi nama akun dan jumlah tagihan <strong>Rp {totalAmount.toLocaleString('id-ID')}</strong>.</p>
                    <p>5. Selesaikan transfer dan simpan bukti pembayaran.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Mock Payment Simulation Trigger */}
            <div className="glass-elevated rounded-2xl border border-accent/40 p-5 shadow-md flex flex-col gap-3 bg-accent/5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-accent" />
                <h3 className="text-xs sm:text-sm font-bold text-primary">Simulator Pembayaran (Mock Gateway)</h3>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Karena ini adalah sistem visualizer prototype, Anda dapat menekan tombol di bawah untuk menyimulasikan notifikasi sukses pembayaran dari payment gateway secara instan.
              </p>

              {paymentError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 font-medium flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>{paymentError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSimulatePaymentSuccess}
                disabled={isSimulating || isExpired}
                className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSimulating ? (
                  <span>Menyimulasikan Pembayaran...</span>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Simulasikan Pembayaran Berhasil</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column (5 cols): Order Summary */}
          <div className="lg:col-span-5 sticky top-[148px] flex flex-col gap-4">
            <div className="glass-elevated rounded-2xl border border-subtle p-6 shadow-md">
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-subtle">
                <Ticket size={16} className="text-accent" />
                <h3 className="text-sm font-bold text-primary">Ringkasan Pesanan</h3>
              </div>

              {/* Event Info */}
              <div className="mb-4">
                <h4 className="text-base font-bold text-primary mb-1">{event.title}</h4>
                <p className="text-xs text-secondary mb-0.5">{event.venueName}</p>
                <p className="text-xs text-accent font-mono">
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
              <div className="border-t border-subtle pt-3 mb-4 flex flex-col gap-2.5 max-h-60 overflow-y-auto">
                <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  Tiket Terpilih ({bookedSeats.length})
                </span>
                {bookedSeats.map((s) => (
                  <div
                    key={s.seatId}
                    className="bg-secondary border border-subtle rounded-xl p-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.sectionColor || '#38bdf8' }}
                      />
                      <div>
                        <p className="text-xs font-semibold text-primary">
                          {s.sectionName} · Row {s.row} - #{s.number}
                        </p>
                        <p className="text-[10px] text-secondary font-mono">{s.tierName}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-primary">
                      Rp {s.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Price Calculations */}
              <div className="border-t border-subtle pt-3 flex flex-col gap-2 text-xs">
                <div className="flex justify-between text-secondary">
                  <span>Subtotal Tiket ({bookedSeats.length})</span>
                  <span className="font-mono text-primary">Rp {totalAmount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Biaya Layanan & Pajak</span>
                  <span className="font-mono text-emerald-600 font-medium">Rp 0 (Termasuk)</span>
                </div>
                <div className="border-t border-subtle pt-2.5 mt-1 flex justify-between items-center">
                  <span className="text-sm font-bold text-primary">Total Tagihan</span>
                  <span className="text-lg font-bold font-mono text-accent">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl glass border border-subtle text-xs text-secondary flex items-start gap-2.5">
              <Info size={16} className="shrink-0 mt-0.5 text-accent" />
              <p className="leading-relaxed">
                Status pembayaran dicek otomatis oleh sistem secara berkala setiap beberapa detik.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal: Payment Success */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-secondary border border-subtle rounded-2xl p-8 max-w-md w-full shadow-2xl text-center text-primary animate-zoom-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-bold text-primary mb-1">Pembayaran Berhasil!</h3>
            <p className="text-xs text-secondary mb-6">
              Tiket Anda telah berhasil dikonfirmasi. Rincian e-ticket telah dikirimkan ke <span className="font-semibold text-primary">{buyerInfo?.email || 'email Anda'}</span>.
            </p>

            <div className="bg-primary border border-subtle rounded-xl p-4 mb-6 text-left flex flex-col gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-secondary">Kode Booking</span>
                <span className="font-mono font-bold text-accent">{reservationId.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Acara</span>
                <span className="font-semibold text-primary truncate max-w-[200px]">{event.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Jumlah Kursi</span>
                <span className="font-semibold text-primary">{bookedSeats.length} Tiket</span>
              </div>
              <div className="flex justify-between border-t border-subtle pt-2">
                <span className="text-secondary">Total Dibayar</span>
                <span className="font-bold text-emerald-600 font-mono">Rp {totalAmount.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => router.push(`/events/${event.id}`)}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Kembali ke Halaman Event
              </button>
              <button
                type="button"
                onClick={() => router.push('/events')}
                className="w-full py-2.5 rounded-xl border border-subtle text-xs font-semibold text-secondary hover:bg-primary transition-colors cursor-pointer"
              >
                Lihat Event Lainnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Timer Expired Modal */}
      {isExpired && !showSuccessModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-secondary border border-subtle rounded-2xl p-7 max-w-md w-full shadow-2xl text-center text-primary animate-zoom-in">
            <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Clock size={28} />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Waktu Pembayaran Telah Habis</h3>
            <p className="text-xs text-secondary mb-6 leading-relaxed">
              Batas waktu untuk menyelesaikan pembayaran telah berakhir. Kursi Anda telah dilepaskan kembali ke publik.
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
