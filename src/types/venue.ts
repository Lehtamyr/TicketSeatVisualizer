export interface Point { x: number; y: number; }
export type ShapeType = 'RECTANGLE' | 'SQUARE' | 'TRIANGLE' | 'POLYGON' | 'CIRCLE' | 'STAGE';

export interface SectionGeometry {
  shapeType: ShapeType;
  points: Point[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  rotation?: number;
  rowConfigs?: { row: string; seatCount: number }[];
  clipToBoundary?: boolean;
  disabledSeats?: string[];
}

export interface PricingTierDTO {
  id: string;
  name: string;
  color: string;
  basePrice: number;
  description?: string | null;
  salesEndDate?: string | Date | null;
  layoutId?: string | null;
}

export interface SectionDTO {
  id: string;
  name: string;
  code: string;
  shapeType: ShapeType;
  geometry: SectionGeometry;
  price: number;
  color: string;
  tierId?: string;
  tierName?: string;
  tierColor?: string;
  totalSeats: number;
  availableSeats: number;
  rowCount?: number;
  seatsPerRow?: number;
  seats?: SeatDTO[];
  pricingTier?: PricingTierDTO;
}

export interface SeatDTO {
  id: string;
  sectionId: string;
  row: string;
  number: number;
  x: number;
  y: number;
  status: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'BLOCKED';
  price: number;
}

export interface VenueLayoutDTO {
  id?: string;
  name?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  pricingTiers?: PricingTierDTO[];
  [key: string]: unknown;
}

export interface EventDTO {
  id: string;
  title: string;
  description?: string | null;
  venueName: string;
  startTime: string;
  endTime?: string | null;
  viewBoxWidth: number;
  viewBoxHeight: number;
  sections: SectionDTO[];
  layout?: VenueLayoutDTO | null;
}

export interface SaveLayoutInput {
  layoutId?: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  sections: {
    id?: string;
    name: string;
    code: string;
    shapeType: ShapeType;
    geometry: SectionGeometry;
    tierId?: string; // Replaces raw price and color, though we can still send them as fallback
    price: number;
    color: string;
    rowCount: number;
    seatsPerRow: number;
    seats: { row: string; number: number; x: number; y: number }[];
  }[];
  pricingTiers?: {
    id?: string;
    name: string;
    color: string;
    basePrice: number;
    description?: string;
    salesEndDate?: string;
  }[];
}

export interface LockSeatsInput {
  eventId: string;
  seatIds: string[];
  userSessionId: string;
}

export interface LockSeatsResult {
  success: boolean;
  reservationId?: string;
  expiresAt?: string;
  error?: string;
  unavailableIds?: string[];
}

export interface ConfirmBookingInput {
  reservationId: string;
  userSessionId: string;
}

export interface ConfirmBookingResult {
  success: boolean;
  error?: string;
}
