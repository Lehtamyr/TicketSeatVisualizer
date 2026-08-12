import { EventEmitter } from 'events';

class SeatBroadcaster extends EventEmitter {}

// Global singleton across Next.js dev server hot-reloads
const globalBroadcaster = global as unknown as { seatEvents?: SeatBroadcaster };
export const seatEvents = globalBroadcaster.seatEvents || new SeatBroadcaster();
if (process.env.NODE_ENV !== 'production') globalBroadcaster.seatEvents = seatEvents;

seatEvents.setMaxListeners(200);

export interface SeatUpdatePayload {
  eventId: string;
  sectionId?: string;
  seatIds: string[];
  status: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'SELECTED';
  userSessionId?: string;
}

export function broadcastSeatUpdate(payload: SeatUpdatePayload) {
  seatEvents.emit('seat-update', payload);
}
