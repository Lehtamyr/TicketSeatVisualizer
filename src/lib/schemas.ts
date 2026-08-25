import { z } from 'zod';

const idSchema = z.string().min(1, 'ID is required').max(128);

export const LockSeatsSchema = z.object({
  eventId: idSchema,
  seatIds: z.array(idSchema).max(20, 'Cannot lock more than 20 seats at once'),
  userSessionId: z.string().min(1).max(128).optional(),
});

export const ConfirmBookingSchema = z.object({
  reservationId: z.string().min(1, 'Reservation ID is required'),
  userSessionId: z.string().min(1).max(128).optional(),
});

export const SaveLayoutSchema = z.object({
  layoutId: idSchema.optional(),
  name: z.string().min(1, 'Name is required').max(200).trim(),
  canvasWidth: z.number().positive().max(10000),
  canvasHeight: z.number().positive().max(10000),
  sections: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, 'Section name is required').max(200).trim(),
      code: z.string().min(1, 'Section code is required').max(50).trim(),
      shapeType: z.enum(['RECTANGLE', 'SQUARE', 'TRIANGLE', 'POLYGON', 'CIRCLE', 'STAGE']),
      geometry: z.unknown(),
      tierId: z.string().optional(),
      price: z.number().min(0),
      color: z.string().regex(/^#[A-Fa-f0-9]{3,8}$/, 'Invalid color code'),
      rowCount: z.number().int().min(0).max(200).default(0),
      seatsPerRow: z.number().int().min(0).max(200).default(0),
      seats: z.array(z.unknown()).max(5000).optional(),
    })
  ).max(100, 'Cannot exceed 100 sections'),
  pricingTiers: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, 'Tier name is required').max(100).trim(),
      color: z.string().regex(/^#[A-Fa-f0-9]{3,8}$/, 'Invalid color code'),
      basePrice: z.number().min(0),
      description: z.string().max(500).optional().nullable(),
      salesEndDate: z.union([z.string(), z.date()]).optional().nullable(),
    })
  ).max(50).optional(),
});

export const CreateEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300).trim(),
  description: z.string().max(2000).optional().nullable(),
  venueName: z.string().min(1, 'Venue name is required').max(300).trim(),
  termsAndConditions: z.string().min(1, 'Terms & Conditions are required').max(10000).trim(),
  startTime: z.string().datetime().or(z.string().min(1)),
  endTime: z.string().datetime().or(z.string().min(1)).optional().nullable(),
  layoutId: idSchema,
});

export const BuyerCredentialsSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100).trim(),
  lastName: z.string().min(1, 'Last name is required').max(100).trim(),
  email: z.string().email('Invalid email address').max(200).trim(),
  phoneCountryCode: z.string().min(1, 'Country code is required').max(10),
  phoneNumber: z.string().min(5, 'Valid phone number is required').max(20).trim(),
  idNumber: z.string().min(4, 'ID number is required').max(50).trim(),
  birthDay: z.number().int().min(1).max(31),
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()),
  gender: z.enum(['MALE', 'FEMALE']),
  whatsappConsent: z.boolean().default(false),
  termsAccepted: z.literal(true, {
    message: 'You must accept the Terms & Conditions',
  }),
  privacyAccepted: z.literal(true, {
    message: 'You must accept the Data Processing Policy',
  }),
  paymentMethod: z.enum(['QRIS', 'GOPAY', 'OVO', 'BCA_VA', 'MANDIRI_VA', 'CREDIT_CARD']).default('QRIS'),
});

export type BuyerCredentials = z.infer<typeof BuyerCredentialsSchema>;
