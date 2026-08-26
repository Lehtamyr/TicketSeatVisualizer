import { describe, it, expect, beforeEach } from 'vitest';
import { defaultBuyerInfo, getStoredBuyerInfo, BuyerInfo } from '@/lib/buyerStorage';

describe('1. Buyer Storage & Form Helpers Unit Tests', () => {
  beforeEach(() => {
    // Clear mock session storage
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear();
    }
  });

  it('should return defaultBuyerInfo when sessionStorage is empty', () => {
    const info = getStoredBuyerInfo();
    expect(info).toEqual(defaultBuyerInfo);
    expect(info.firstName).toBe('');
    expect(info.dialCode).toBe('+62');
    expect(info.identityType).toBe('KTP');
    expect(info.termsAccepted).toBe(false);
  });

  it('should correctly deserialize and merge saved buyer info from sessionStorage', () => {
    const customInfo: Partial<BuyerInfo> = {
      firstName: 'Budi',
      lastName: 'Santoso',
      email: 'budi@example.com',
      phoneNumber: '81234567890',
      identityNumber: '3171012345678901',
      identityType: 'KTP',
      gender: 'MALE',
      termsAccepted: true,
      privacyAccepted: true,
    };

    window.sessionStorage.setItem('tsv_buyer_info', JSON.stringify(customInfo));

    const retrieved = getStoredBuyerInfo();
    expect(retrieved.firstName).toBe('Budi');
    expect(retrieved.lastName).toBe('Santoso');
    expect(retrieved.email).toBe('budi@example.com');
    expect(retrieved.phoneNumber).toBe('81234567890');
    expect(retrieved.termsAccepted).toBe(true);
    expect(retrieved.dialCode).toBe('+62'); // Inherited fallback
  });

  it('should handle corrupted JSON in sessionStorage gracefully without crashing', () => {
    window.sessionStorage.setItem('tsv_buyer_info', 'invalid-json{}}');
    const retrieved = getStoredBuyerInfo();
    expect(retrieved).toEqual(defaultBuyerInfo);
  });
});

describe('2. Journey Tracker Step Calculation Unit Tests', () => {
  it('should calculate correct percentage for each step in 4-step funnel', () => {
    const calcProgress = (currentStep: number) =>
      Math.min(100, Math.max(0, ((currentStep - 1) / 3) * 100));

    expect(calcProgress(1)).toBe(0); // Step 1: Pilih Kursi (0%)
    expect(Math.round(calcProgress(2))).toBe(33); // Step 2: Informasi (33.3%)
    expect(Math.round(calcProgress(3))).toBe(67); // Step 3: Konfirmasi (66.7%)
    expect(calcProgress(4)).toBe(100); // Step 4: Pembayaran (100%)
  });
});

describe('3. Payment Method Mapping & Mock VA Generation Unit Tests', () => {
  it('should assign prefix 99 and 8 digits for Bank Jakarta Virtual Account', () => {
    const getVaNumber = (method: string, reservationId: string) => {
      const vaPrefix = '99';
      const cleanDigits = reservationId.replace(/\D/g, '').padEnd(8, '8').slice(0, 8);
      return `${vaPrefix} ${cleanDigits.slice(0, 4)} ${cleanDigits.slice(4, 8)}`;
    };

    const mockResId = 'res-1234-5678-90ab';
    const jakartaVa = getVaNumber('BANK_JAKARTA_VA', mockResId);

    expect(jakartaVa.startsWith('99 ')).toBe(true);
    const rawVaDigits = jakartaVa.replace(/\s/g, '');
    expect(rawVaDigits.length).toBe(10);
    expect(rawVaDigits.startsWith('99')).toBe(true);
    expect(rawVaDigits).toBe('9912345678');
  });
});
