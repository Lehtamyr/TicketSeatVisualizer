'use client';

import React, { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { SeatDTO, SectionDTO, PricingTierDTO } from '@/types/venue';
import { ShoppingCart, Clock, CheckCircle, Ticket, ChevronRight, XCircle } from 'lucide-react';

const emptySubscribe = () => () => {};

interface BookingCartSidebarProps {
  sections: SectionDTO[];
  pricingTiers?: PricingTierDTO[];
  eventId: string;
  termsAndConditions?: string | null;
  selectedSeats: SeatDTO[];
  onClearSeat: (seatId: string) => void;
  onBookingComplete: () => void;
  userSessionId: string;
}

type CartState = 'idle' | 'confirming_order' | 'reviewing_tnc' | 'checking_out' | 'confirmed' | 'error';

export function BookingCartSidebar({
  sections,
  pricingTiers,
  eventId,
  termsAndConditions,
  selectedSeats,
  onClearSeat,
  onBookingComplete,
  userSessionId,
}: BookingCartSidebarProps) {
  const router = useRouter();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [cartState, setCartState] = useState<CartState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes
  const [pendingReservationId, setPendingReservationId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPrice = selectedSeats.reduce(
    (sum, s) => sum + (typeof s.price === 'number' && !isNaN(s.price) ? s.price : Number(s.price) || sections.find(sec => sec.id === s.sectionId)?.price || 0),
    0
  );

  // Countdown timer starts immediately when there are selected seats
  useEffect(() => {
    if (selectedSeats.length > 0 && cartState !== 'confirmed') {
      if (!timerRef.current) {
        setTimeLeft(600);
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              timerRef.current = null;
              setCartState('error');
              setError('Time limit reached. Please select seats again.');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [selectedSeats.length, cartState]);

  // Step 1: User clicks "Proceed to Checkout" -> Lock seats & Open Confirmation Modal
  const handleInitiateCheckout = async () => {
    if (selectedSeats.length === 0) return;
    const now = new Date();
    if (pricingTiers) {
      for (const seat of selectedSeats) {
        const sec = sections.find(s => s.id === seat.sectionId);
        if (sec && sec.tierId) {
          const tier = pricingTiers.find(t => t.id === sec.tierId);
          if (tier && tier.salesEndDate && new Date(tier.salesEndDate) < now) {
            setCartState('error');
            setError(`Sales for ${tier.name} have ended.`);
            return;
          }
        }
      }
    }

    setCartState('checking_out');
    setError(null);

    try {
      // 1. Lock seats via HTTP API
      const lockResp = await fetch('/api/reservations/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          seatIds: selectedSeats.map((s) => s.id),
          userSessionId,
        }),
      });
      const lockResult = await lockResp.json();

      if (!lockResp.ok || !lockResult.success) {
        // If reservationId is already held or returned in payload, we can proceed
        if (lockResult.reservationId || lockResult.data?.reservationId) {
          const resId = lockResult.reservationId || lockResult.data?.reservationId;
          setPendingReservationId(resId);
          setCartState('confirming_order');
          return;
        }
        setCartState('error');
        setError(lockResult.error ?? 'Failed to reserve seats.');
        return;
      }

      const resId = lockResult.reservationId || lockResult.data?.reservationId || lockResult.id || 'res-pending-001';
      setPendingReservationId(resId);

      // Step 2: Open Confirmation Modal (Modal 1)
      setCartState('confirming_order');
    } catch (err) {
      setCartState('error');
      setError('Checkout request failed.');
    }
  };

  // Step 2 -> Step 3: User confirms order -> Open Terms & Conditions Modal (Modal 2)
  const handleConfirmOrder = () => {
    setCartState('reviewing_tnc');
  };

  // Step 3 -> Navigation: User agrees to TnC -> Navigate to Checkout Page
  const handleAgreeAndProceed = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    router.push(`/events/${eventId}/checkout?reservationId=${pendingReservationId || ''}`);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isUrgent = timeLeft < 120;

  return (
    <div className="glass-elevated rounded-2xl flex flex-col h-full overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="px-5 py-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="text-accent" size={18} />
          <span className="font-semibold text-sm text-primary">Booking Cart</span>
          {selectedSeats.length > 0 && (
            <span className="ml-auto bg-accent text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {selectedSeats.length}
            </span>
          )}
        </div>
      </div>

      {/* Section info */}
      <div className="px-5 py-3 border-b border-subtle">
        <span className="text-sm font-medium text-secondary">Your Selections</span>
      </div>

      {/* Seat list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {selectedSeats.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">
            <Ticket size={32} className="mx-auto mb-2 opacity-30" />
            <p>Click seats on the map<br />to add them here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedSeats.map((seat) => (
              <div key={seat.id}
                className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm text-primary font-medium">
                    {(() => {
                      const sec = sections.find(s => s.id === seat.sectionId);
                      return sec ? sec.name + ' - ' : '';
                    })()}
                    Row {seat.row} · #{seat.number}
                  </p>
                  <p className="text-xs text-secondary">
                    Rp {((typeof seat.price === 'number' && !isNaN(seat.price) ? seat.price : Number(seat.price) || sections.find(sec => sec.id === seat.sectionId)?.price || 0)).toLocaleString("id-ID")}
                  </p>
                </div>
                {cartState === 'idle' && (
                  <button
                    onClick={() => onClearSeat(seat.id)}
                    className="text-muted hover:text-accent-hover transition-colors p-1"
                    aria-label="Remove seat"
                  >
                    <XCircle size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="px-5 py-3 border-t border-subtle">
        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Total</span>
          <span data-testid="cart-total-price" className="text-lg font-bold text-primary">Rp {(totalPrice.toLocaleString("id-ID"))}</span>
        </div>
      </div>

      {/* Timer */}
      {selectedSeats.length > 0 && cartState !== 'confirmed' && (
        <div
          data-testid="countdown-timer"
          className={`mx-5 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 reservation-timer ${isUrgent ? 'bg-secondary border border-accent' : 'bg-secondary border border-subtle'
            }`}
        >
          <Clock size={14} className={isUrgent ? 'text-accent' : 'text-accent'} />
          <span className={`text-sm font-mono font-semibold ${isUrgent ? 'text-accent' : 'text-accent'}`}>
            {formatTime(timeLeft)}
          </span>
          <span className="text-xs text-secondary ml-1">to checkout</span>
        </div>
      )}

      {/* Error */}
      {error && cartState === 'error' && (
        <div className="mx-5 mb-3 bg-secondary border border-subtle rounded-lg px-3 py-2">
          <p className="text-xs text-accent">{error}</p>
        </div>
      )}

      {/* Confirmation Message */}
      {cartState === 'confirmed' && (
        <div
          data-testid="booking-confirmation-modal"
          className="mx-5 mb-3 bg-secondary border border-subtle rounded-lg px-3 py-2 flex flex-col gap-1 checkout-success"
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-accent" />
            <p className="text-sm text-accent font-semibold">Booking Successful!</p>
          </div>
          <p className="text-xs text-secondary">
            Reservation Confirmed
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 pb-5">
        {cartState === 'idle' || cartState === 'error' ? (
          <button
            data-testid="checkout-button"
            onClick={handleInitiateCheckout}
            disabled={selectedSeats.length === 0}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
              bg-accent hover:bg-accent-hover text-secondary disabled:opacity-30 disabled:cursor-not-allowed shadow-md
                "
          >
            Proceed to Checkout
            <ChevronRight size={16} />
          </button>
        ) : cartState === 'checking_out' ? (
          <button disabled className="w-full py-3 rounded-xl bg-secondary text-primary text-sm font-semibold animate-pulse">
            Processing Checkout…
          </button>
        ) : null}
      </div>

      {/* Modal 1: User Order Confirmation Modal (Full-screen overlay & centered at document root) */}
      {mounted && cartState === 'confirming_order' && createPortal(
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div data-testid="booking-confirmation-modal" className="bg-secondary border border-subtle rounded-2xl shadow-2xl p-6 relative max-w-md w-full animate-zoom-in text-primary">
            <h3 className="text-base font-bold text-primary mb-1 flex items-center gap-2">
              <ShoppingCart size={18} className="text-accent" />
              Konfirmasi Pemesanan Tiket
            </h3>
            <p className="text-xs text-secondary mb-4">
              Periksa kembali rincian tiket yang Anda pilih sebelum melanjutkan ke pengisian data pembeli.
            </p>

            <div className="bg-primary border border-subtle rounded-xl p-3.5 mb-4 max-h-48 overflow-y-auto flex flex-col gap-2">
              {selectedSeats.map((seat) => {
                const sec = sections.find((s) => s.id === seat.sectionId);
                const seatPrice = typeof seat.price === 'number' && !isNaN(seat.price) ? seat.price : Number(seat.price) || sec?.price || 0;
                return (
                  <div key={seat.id} className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-primary">
                      {sec ? `${sec.name} - ` : ''}Row {seat.row}, Seat #{seat.number}
                    </span>
                    <span className="font-mono text-secondary">Rp {seatPrice.toLocaleString('id-ID')}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-subtle pt-3 mb-6 flex justify-between items-center">
              <span className="text-xs font-semibold text-secondary">Total Pembayaran ({selectedSeats.length} Tiket)</span>
              <span className="text-base font-bold text-accent font-mono">Rp {totalPrice.toLocaleString('id-ID')}</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCartState('idle')}
                className="flex-1 py-2.5 rounded-xl border border-subtle text-xs font-semibold text-secondary hover:bg-primary transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Ya, Lanjutkan
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 2: Terms & Conditions (TnC) Information Modal */}
      {mounted && cartState === 'reviewing_tnc' && createPortal(
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-secondary border border-subtle rounded-2xl shadow-2xl p-6 relative max-w-lg w-full animate-zoom-in text-primary">
            <h3 className="text-base font-bold text-primary mb-1 flex items-center gap-2">
              <Ticket size={18} className="text-accent" />
              Syarat & Ketentuan Event
            </h3>
            <p className="text-xs text-secondary mb-4">
              Harap membaca dan memahami ketentuan yang berlaku untuk event ini sebelum melakukan pembayaran.
            </p>

            <div className="bg-primary border border-subtle rounded-xl p-4 mb-6 max-h-64 overflow-y-auto text-xs text-primary whitespace-pre-line leading-relaxed font-sans">
              {termsAndConditions ? (
                termsAndConditions
              ) : (
                <>
                  1. Tiket yang sudah dibeli bersifat Non-Refundable (tidak dapat dikembalikan atau ditukar).{'\n'}
                  2. Pembeli wajib menunjukkan kartu identitas resmi yang valid (KTP/Passport) sesuai nama pemesan saat penukaran tiket.{'\n'}
                  3. Pengunjung wajib mematuhi seluruh protokol keamanan dan tata tertib venue acara.{'\n'}
                  4. Dilarang membawa senjata, zat terlarang, alkohol, dan kamera profesional ke dalam area konser.
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCartState('confirming_order')}
                className="py-2.5 px-4 rounded-xl border border-subtle text-xs font-semibold text-secondary hover:bg-primary transition-colors cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleAgreeAndProceed}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Saya Setuju & Lanjut ke Pembayaran
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
