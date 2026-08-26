import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BuyerCredentialsSchema,
  ConfirmBookingSchema,
  LockSeatsSchema,
} from '@/lib/schemas';
import { getStoredBuyerInfo, defaultBuyerInfo } from '@/lib/buyerStorage';
import { confirmBookingAction } from '@/actions/confirmBooking';
import { prisma } from '@/lib/prisma';

describe('Checkout Flow Validation & Edge Cases Unit Tests', () => {
  const validBuyerPayload = {
    firstName: 'Ahmad',
    lastName: 'Dahlan',
    email: 'ahmad.dahlan@example.com',
    phoneCountryCode: '+62',
    phoneNumber: '81234567890',
    idNumber: '3171012345678901',
    birthDay: 15,
    birthMonth: 8,
    birthYear: 1995,
    gender: 'MALE' as const,
    whatsappConsent: true,
    termsAccepted: true as const,
    privacyAccepted: true as const,
    paymentMethod: 'QRIS' as const,
  };

  describe('1. BuyerCredentialsSchema - Input Validation & Edge Cases', () => {
    it('accepts completely valid buyer information payload', () => {
      const result = BuyerCredentialsSchema.safeParse(validBuyerPayload);
      expect(result.success).toBe(true);
    });

    describe('First & Last Name Validations', () => {
      it('rejects empty or whitespace-only first name', () => {
        const emptyResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          firstName: '',
        });
        expect(emptyResult.success).toBe(false);

        const wsResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          firstName: '   ',
        });
        expect(wsResult.success).toBe(false);
      });

      it('rejects empty or whitespace-only last name', () => {
        const emptyResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          lastName: '',
        });
        expect(emptyResult.success).toBe(false);

        const wsResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          lastName: '   ',
        });
        expect(wsResult.success).toBe(false);
      });

      it('rejects names exceeding 100 characters', () => {
        const longName = 'A'.repeat(101);
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          firstName: longName,
        });
        expect(result.success).toBe(false);
      });

      it('accepts names with unicode, accents, and single characters', () => {
        const unicodeResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          firstName: 'Élise',
          lastName: 'O’Connor',
        });
        expect(unicodeResult.success).toBe(true);

        const singleCharResult = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          firstName: 'U',
          lastName: 'Li',
        });
        expect(singleCharResult.success).toBe(true);
      });
    });

    describe('Email Format Validations', () => {
      it('rejects invalid email formats', () => {
        const invalidEmails = [
          'plainaddress',
          '@missingusername.com',
          'username@.com',
          'username@domain..com',
          'username space@domain.com',
          'username@domain,com',
        ];

        for (const email of invalidEmails) {
          const result = BuyerCredentialsSchema.safeParse({
            ...validBuyerPayload,
            email,
          });
          expect(result.success).toBe(false);
        }
      });

      it('accepts valid complex email formats with subdomains, tags and periods', () => {
        const validEmails = [
          'user.name+tag@sub.domain.co.id',
          'buyer_123@tickets-app.io',
          'support@jakarta-center.org',
        ];

        for (const email of validEmails) {
          const result = BuyerCredentialsSchema.safeParse({
            ...validBuyerPayload,
            email,
          });
          expect(result.success).toBe(true);
        }
      });

      it('rejects emails exceeding 200 characters', () => {
        const longEmail = 'a'.repeat(195) + '@test.com';
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          email: longEmail,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('Phone Number & Dial Code Validations', () => {
      it('rejects empty or missing dial code', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          phoneCountryCode: '',
        });
        expect(result.success).toBe(false);
      });

      it('rejects phone numbers shorter than 5 characters', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          phoneNumber: '1234',
        });
        expect(result.success).toBe(false);
      });

      it('rejects phone numbers exceeding 20 characters', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          phoneNumber: '123456789012345678901',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('Identity Number Validations', () => {
      it('rejects ID numbers shorter than 4 characters', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          idNumber: '123',
        });
        expect(result.success).toBe(false);
      });

      it('rejects ID numbers exceeding 50 characters', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          idNumber: '1'.repeat(51),
        });
        expect(result.success).toBe(false);
      });
    });

    describe('Date of Birth Validations', () => {
      it('rejects birth day out of bounds (< 1 or > 31)', () => {
        expect(
          BuyerCredentialsSchema.safeParse({ ...validBuyerPayload, birthDay: 0 }).success
        ).toBe(false);
        expect(
          BuyerCredentialsSchema.safeParse({ ...validBuyerPayload, birthDay: 32 }).success
        ).toBe(false);
      });

      it('rejects birth month out of bounds (< 1 or > 12)', () => {
        expect(
          BuyerCredentialsSchema.safeParse({ ...validBuyerPayload, birthMonth: 0 }).success
        ).toBe(false);
        expect(
          BuyerCredentialsSchema.safeParse({ ...validBuyerPayload, birthMonth: 13 }).success
        ).toBe(false);
      });

      it('rejects birth year out of bounds (< 1900 or in the future)', () => {
        expect(
          BuyerCredentialsSchema.safeParse({ ...validBuyerPayload, birthYear: 1899 }).success
        ).toBe(false);
        expect(
          BuyerCredentialsSchema.safeParse({
            ...validBuyerPayload,
            birthYear: new Date().getFullYear() + 1,
          }).success
        ).toBe(false);
      });
    });

    describe('Mandatory Terms and Privacy Policy Consent', () => {
      it('rejects if termsAccepted is false', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          termsAccepted: false,
        });
        expect(result.success).toBe(false);
      });

      it('rejects if privacyAccepted is false', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          privacyAccepted: false,
        });
        expect(result.success).toBe(false);
      });

      it('accepts when both termsAccepted and privacyAccepted are true', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          termsAccepted: true,
          privacyAccepted: true,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Payment Method Selection Enum', () => {
      it('accepts all supported payment methods', () => {
        const methods = ['QRIS', 'GOPAY', 'OVO', 'BCA_VA', 'MANDIRI_VA', 'CREDIT_CARD'] as const;
        for (const method of methods) {
          const result = BuyerCredentialsSchema.safeParse({
            ...validBuyerPayload,
            paymentMethod: method,
          });
          expect(result.success).toBe(true);
        }
      });

      it('rejects unknown payment method string', () => {
        const result = BuyerCredentialsSchema.safeParse({
          ...validBuyerPayload,
          paymentMethod: 'BITCOIN' as any,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('2. Client Session Storage Recovery & Fallbacks', () => {
    it('returns defaultBuyerInfo safely when window is undefined (SSR mode)', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const info = getStoredBuyerInfo();
      expect(info).toEqual(defaultBuyerInfo);
      expect(info.termsAccepted).toBe(false);
      expect(info.privacyAccepted).toBe(false);
      expect(info.dialCode).toBe('+62');

      global.window = originalWindow;
    });

    it('recovers saved data from sessionStorage safely', () => {
      const mockStorage: Record<string, string> = {
        tsv_buyer_info: JSON.stringify({
          firstName: 'Budi',
          lastName: 'Santoso',
          email: 'budi@example.com',
          termsAccepted: true,
          privacyAccepted: true,
        }),
      };

      const mockWindow = {
        sessionStorage: {
          getItem: (key: string) => mockStorage[key] || null,
          setItem: (key: string, val: string) => {
            mockStorage[key] = val;
          },
          removeItem: (key: string) => {
            delete mockStorage[key];
          },
        },
      };

      // @ts-ignore
      global.window = mockWindow;

      const info = getStoredBuyerInfo();
      expect(info.firstName).toBe('Budi');
      expect(info.lastName).toBe('Santoso');
      expect(info.email).toBe('budi@example.com');
      expect(info.termsAccepted).toBe(true);
      expect(info.dialCode).toBe('+62'); // Default maintained
    });
  });

  describe('3. Backend Confirmation Action Edge Cases', () => {
    it('rejects confirmation with empty reservationId', async () => {
      const res = await confirmBookingAction({
        reservationId: '',
        userSessionId: 'sess-test',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejects confirmation when reservation does not exist in database', async () => {
      const res = await confirmBookingAction({
        reservationId: 'res-non-existent-uuid-999',
        userSessionId: 'sess-test',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Reservation not found');
    });

    it('validates ConfirmBookingSchema correctly', () => {
      expect(ConfirmBookingSchema.safeParse({ reservationId: '' }).success).toBe(false);
      expect(ConfirmBookingSchema.safeParse({ reservationId: 'res-123' }).success).toBe(true);
      expect(
        ConfirmBookingSchema.safeParse({
          reservationId: 'res-123',
          userSessionId: 'sess-abc',
        }).success
      ).toBe(true);
    });

    it('validates LockSeatsSchema boundaries (max 20 seats)', () => {
      expect(
        LockSeatsSchema.safeParse({
          eventId: 'evt-1',
          seatIds: [],
        }).success
      ).toBe(true);

      const twentySeats = Array.from({ length: 20 }, (_, i) => `seat-${i}`);
      expect(
        LockSeatsSchema.safeParse({
          eventId: 'evt-1',
          seatIds: twentySeats,
        }).success
      ).toBe(true);

      const twentyOneSeats = Array.from({ length: 21 }, (_, i) => `seat-${i}`);
      const overLimit = LockSeatsSchema.safeParse({
        eventId: 'evt-1',
        seatIds: twentyOneSeats,
      });
      expect(overLimit.success).toBe(false);
      expect(overLimit.error?.issues[0].message).toContain('Cannot lock more than 20 seats');
    });
  });
});
