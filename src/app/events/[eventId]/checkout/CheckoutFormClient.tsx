'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  Ticket,
  Clock,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  Info,
  X,
  User,
  CheckCircle2,
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

interface CheckoutFormClientProps {
  event: {
    id: string;
    title: string;
    venueName: string;
    startTime: string;
    termsAndConditions?: string | null;
  };
  reservationId: string;
  bookedSeats: BookedSeatInfo[];
  totalAmount: number;
  expiresAtIso: string;
}

const COUNTRY_DIAL_CODES = [
  { code: '+62', country: 'Indonesia', flag: '🇮🇩' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
  { code: '+66', country: 'Thailand', flag: '🇹🇭' },
  { code: '+63', country: 'Philippines', flag: '🇵🇭' },
  { code: '+84', country: 'Vietnam', flag: '🇻🇳' },
  { code: '+1', country: 'United States', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+91', country: 'India', flag: '🇮🇳' },
];

export function CheckoutFormClient({
  event,
  reservationId,
  bookedSeats,
  totalAmount,
  expiresAtIso,
}: CheckoutFormClientProps) {
  const router = useRouter();

  // Lazy state initializers
  const [firstName, setFirstName] = useState(() => getStoredBuyerInfo().firstName);
  const [lastName, setLastName] = useState(() => getStoredBuyerInfo().lastName);
  const [email, setEmail] = useState(() => getStoredBuyerInfo().email);
  const [dialCode, setDialCode] = useState(() => getStoredBuyerInfo().dialCode);
  const [phoneNumber, setPhoneNumber] = useState(() => getStoredBuyerInfo().phoneNumber);
  const [identityType, setIdentityType] = useState<'KTP' | 'PASSPORT' | 'SIM'>(() => getStoredBuyerInfo().identityType);
  const [identityNumber, setIdentityNumber] = useState(() => getStoredBuyerInfo().identityNumber);
  const [birthDay, setBirthDay] = useState(() => getStoredBuyerInfo().birthDay);
  const [birthMonth, setBirthMonth] = useState(() => getStoredBuyerInfo().birthMonth);
  const [birthYear, setBirthYear] = useState(() => getStoredBuyerInfo().birthYear);
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>(() => getStoredBuyerInfo().gender);
  const [whatsappConsent, setWhatsappConsent] = useState(() => getStoredBuyerInfo().whatsappConsent);
  const [termsAccepted, setTermsAccepted] = useState(() => getStoredBuyerInfo().termsAccepted);
  const [privacyAccepted, setPrivacyAccepted] = useState(() => getStoredBuyerInfo().privacyAccepted);

  // UI State
  const [isDialDropdownOpen, setIsDialDropdownOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'NONE' | 'TNC' | 'PRIVACY'>('NONE');
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

  const handleProceedToPaymentMethod = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!termsAccepted || !privacyAccepted) {
      setSubmitError('Anda wajib menyetujui Syarat & Ketentuan serta Kebijakan Pemrosesan Data.');
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phoneNumber.trim() || !identityNumber.trim()) {
      setSubmitError('Harap lengkapi semua data pembeli yang wajib diisi.');
      return;
    }

    // Save buyer information to session storage
    const buyerData = {
      firstName,
      lastName,
      email,
      dialCode,
      phoneNumber,
      identityType,
      identityNumber,
      birthDay,
      birthMonth,
      birthYear,
      gender,
      whatsappConsent,
      termsAccepted,
      privacyAccepted,
    };

    sessionStorage.setItem('tsv_buyer_info', JSON.stringify(buyerData));

    // Redirect to Step 2B: Payment Method Selection
    router.push(`/events/${event.id}/checkout/payment-method?reservationId=${reservationId}`);
  };

  const isUrgent = timeLeft < 60;
  const months = [
    'Januari (01)', 'Februari (02)', 'Maret (03)', 'April (04)',
    'Mei (05)', 'Juni (06)', 'Juli (07)', 'Agustus (08)',
    'September (09)', 'Oktober (10)', 'November (11)', 'Desember (12)'
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 90 }, (_, i) => currentYear - 12 - i);

  return (
    <div className="flex-1 flex flex-col bg-primary text-primary">
      {/* Top Navbar */}
      <header className="glass border-b border-subtle px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${event.id}`}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Kembali ke Visualizer</span>
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

      {/* Persistent 4-Step Journey Tracker (Step 2: Informasi - Part A Data Pembeli) */}
      <CheckoutJourneyTracker currentStep={2} subStep="BUYER_INFO" />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Sticky Countdown Timer with vibrant solid borders */}
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
              Selesaikan pengisian data sebelum waktu habis:
            </span>
            <span className={`text-base sm:text-lg font-mono font-bold ${isUrgent ? 'text-red-600' : 'text-accent'}`}>
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>

        {/* 2-Column Grid */}
        <form onSubmit={handleProceedToPaymentMethod} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Vertical Buyer Form */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border-2 border-subtle p-6 shadow-md flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent/10 text-accent">
                    <User size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-primary">Informasi Data Pembeli</h2>
                    <p className="text-xs text-secondary">Data wajib sesuai dengan kartu identitas resmi</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-accent/10 text-accent">
                  Wajib Diisi
                </span>
              </div>

              {/* Vertical Field 1: Nama Depan */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Nama Depan <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Contoh: John"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-primary placeholder:text-slate-400 outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all font-medium"
                />
              </div>

              {/* Vertical Field 2: Nama Belakang */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Nama Belakang <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Contoh: Doe"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-primary placeholder:text-slate-400 outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all font-medium"
                />
              </div>

              {/* Vertical Field 3: Email */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Alamat Email (E-Ticket akan dikirim ke sini) <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-primary placeholder:text-slate-400 outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all font-medium"
                />
              </div>

              {/* Vertical Field 4: Nomor Identitas */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Nomor Identitas Resmi (KTP / Passport / SIM) <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={identityType}
                    onChange={(e) => setIdentityType(e.target.value as any)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-primary outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer font-semibold shadow-sm"
                  >
                    <option value="KTP" className="bg-white text-slate-800">KTP</option>
                    <option value="PASSPORT" className="bg-white text-slate-800">Passport</option>
                    <option value="SIM" className="bg-white text-slate-800">SIM</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={identityNumber}
                    onChange={(e) => setIdentityNumber(e.target.value)}
                    placeholder="3171xxxxxxxxxxxx"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-primary placeholder:text-slate-400 outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all font-mono font-medium"
                  />
                </div>
              </div>

              {/* Vertical Field 5: Phone Number */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Nomor Telepon / WhatsApp <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="relative flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDialDropdownOpen(!isDialDropdownOpen)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-primary flex items-center gap-1.5 hover:border-accent transition-colors shadow-sm cursor-pointer font-semibold"
                  >
                    <span>{COUNTRY_DIAL_CODES.find((c) => c.code === dialCode)?.flag}</span>
                    <span className="font-mono">{dialCode}</span>
                  </button>

                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="81234567890"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-primary placeholder:text-slate-400 outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all font-mono font-medium"
                  />

                  {isDialDropdownOpen && (
                    <div className="absolute top-12 left-0 z-50 bg-white border-2 border-slate-200 rounded-xl shadow-2xl p-2 w-64 max-h-52 overflow-y-auto">
                      {COUNTRY_DIAL_CODES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setDialCode(c.code);
                            setIsDialDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-slate-100 transition-colors ${
                            dialCode === c.code ? 'bg-accent text-white font-bold' : 'text-primary'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span>{c.flag}</span>
                            <span className="truncate">{c.country}</span>
                          </span>
                          <span className={`font-mono ${dialCode === c.code ? 'text-white' : 'text-secondary'}`}>
                            {c.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Vertical Field 6: Date of Birth */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-1.5">
                  Tanggal Lahir <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <select
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-primary outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer font-medium shadow-sm"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d} className="bg-white text-slate-800">{d}</option>
                    ))}
                  </select>

                  <select
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-primary outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer font-medium shadow-sm"
                  >
                    {months.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1} className="bg-white text-slate-800">{m}</option>
                    ))}
                  </select>

                  <select
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-primary outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer font-medium shadow-sm"
                  >
                    {years.map((y) => (
                      <option key={y} value={y} className="bg-white text-slate-800">{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vertical Field 7: Gender */}
              <div>
                <label className="text-xs font-semibold text-secondary block mb-2">
                  Jenis Kelamin <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    gender === 'MALE'
                      ? 'bg-blue-50 border-blue-600 text-blue-700 font-bold ring-1 ring-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 font-medium'
                  }`}>
                    <input
                      type="radio"
                      name="gender"
                      value="MALE"
                      checked={gender === 'MALE'}
                      onChange={() => setGender('MALE')}
                      className="accent-accent cursor-pointer"
                    />
                    <span>Laki-laki</span>
                  </label>

                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    gender === 'FEMALE'
                      ? 'bg-blue-50 border-blue-600 text-blue-700 font-bold ring-1 ring-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 font-medium'
                  }`}>
                    <input
                      type="radio"
                      name="gender"
                      value="FEMALE"
                      checked={gender === 'FEMALE'}
                      onChange={() => setGender('FEMALE')}
                      className="accent-accent cursor-pointer"
                    />
                    <span>Perempuan</span>
                  </label>
                </div>
              </div>

              {/* Terms and Privacy */}
              <div className="flex flex-col gap-3 pt-3 border-t border-subtle">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="accent-accent rounded mt-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-secondary">
                    Saya telah membaca dan menyetujui{' '}
                    <button
                      type="button"
                      onClick={() => setActiveModal('TNC')}
                      className="text-accent hover:underline font-bold inline-flex items-center gap-0.5"
                    >
                      Syarat & Ketentuan Pembelian Tiket
                      <ExternalLink size={11} />
                    </button>
                    {' '}<span className="text-red-500 font-bold">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="accent-accent rounded mt-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-secondary">
                    Saya menyetujui{' '}
                    <button
                      type="button"
                      onClick={() => setActiveModal('PRIVACY')}
                      className="text-accent hover:underline font-bold inline-flex items-center gap-0.5"
                    >
                      Kebijakan Pemrosesan Data Pribadi
                      <ExternalLink size={11} />
                    </button>
                    {' '}<span className="text-red-500 font-bold">*</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Order Summary + Action Button */}
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

              {submitError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-600 font-bold">
                  {submitError}
                </div>
              )}

              {/* Continue to Payment Method Button */}
              <button
                type="submit"
                disabled={isExpired}
                className="w-full mt-5 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Lanjut ke Metode Pembayaran</span>
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-white border border-subtle text-xs text-secondary flex items-start gap-2.5 shadow-sm">
              <Info size={16} className="shrink-0 mt-0.5 text-accent" />
              <p className="leading-relaxed">
                Kursi Anda terkunci selama waktu hitung mundur berlangsung. Selesaikan pengisian data agar kursi tidak dilepas ke pembeli lain.
              </p>
            </div>
          </div>
        </form>
      </main>

      {/* Modal: Terms and Conditions */}
      {activeModal === 'TNC' && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative text-primary animate-zoom-in">
            <button
              onClick={() => setActiveModal('NONE')}
              className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-primary mb-2 flex items-center gap-2">
              <Ticket size={18} className="text-accent" />
              Syarat & Ketentuan Pembelian Tiket
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 max-h-72 overflow-y-auto text-xs leading-relaxed whitespace-pre-line text-primary">
              {event.termsAndConditions || (
                <>
                  1. Setiap tiket yang telah dikonfirmasi bersifat final dan tidak dapat dibatalkan atau direfund.{'\n'}
                  2. Nama pada identitas resmi (KTP/Passport) harus sesuai dengan nama pembeli yang tertera pada E-Ticket.{'\n'}
                  3. Dilarang memperjualbelikan tiket kembali di luar platform resmi.{'\n'}
                  4. Penyelenggara berhak menolak masuk bagi penonton yang tidak mematuhi peraturan acara.
                </>
              )}
            </div>
            <button
              onClick={() => {
                setTermsAccepted(true);
                setActiveModal('NONE');
              }}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Saya Mengerti & Setuju
            </button>
          </div>
        </div>
      )}

      {/* Modal: Data Processing Policy */}
      {activeModal === 'PRIVACY' && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative text-primary animate-zoom-in">
            <button
              onClick={() => setActiveModal('NONE')}
              className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-primary mb-2 flex items-center gap-2">
              <ShieldCheck size={18} className="text-accent" />
              Kebijakan Pemrosesan Data Pribadi
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 max-h-72 overflow-y-auto text-xs leading-relaxed text-primary flex flex-col gap-2">
              <p>
                1. Data pribadi Anda (Nama, Email, No. Telepon, No. Identitas, Tanggal Lahir) disimpan secara aman dan terenkripsi.
              </p>
              <p>
                2. Data hanya digunakan untuk keperluan verifikasi kepemilikan tiket, penerbitan E-Ticket, dan komunikasi penting terkait pelaksanaan event.
              </p>
              <p>
                3. Kami tidak akan menjual atau membagikan data pribadi Anda kepada pihak ketiga yang tidak berwenang tanpa persetujuan Anda.
              </p>
            </div>
            <button
              onClick={() => {
                setPrivacyAccepted(true);
                setActiveModal('NONE');
              }}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Saya Menyetujui Kebijakan Data
            </button>
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
              Batas waktu untuk menyelesaikan pengisian data telah berakhir. Kursi Anda telah dilepaskan kembali ke publik.
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
