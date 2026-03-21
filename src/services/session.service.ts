import { prisma } from '@/lib/prisma';
import type {
  BookSessionInput,
  CancelSessionInput,
  RescheduleSessionInput,
  BulkCancelInput,
} from '@/schemas/session.schema';

export class SessionService {
  async create(studentId: string, data: BookSessionInput) {
    // TODO: Implementar via /auto-flow execute
    // 1. Check slot exists, not blocked, no session yet
    // 2. Check student has no PAST_SLOT
    // 3. Check maxFutureSessions limit
    // 4. creditService.consumeFEFO(studentId) → creditBatchId
    // 5. Optimistic lock: UPDATE slot WHERE version = currentVersion → IF 0 rows → SLOT_UNAVAILABLE
    // 6. INSERT Session
    // 7. EmailService.send(BOOKING_CONFIRMED, ...)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async cancel(sessionId: string, userId: string, role: string, data: CancelSessionInput) {
    // TODO: Implementar via /auto-flow execute
    // 1. Find session, check ownership
    // 2. If student && startAt - NOW() < 12h → no credit refund (LATE_CANCELLATION)
    // 3. creditService.refund(sessionId) if applicable
    // 4. Update status, cancelledAt, cancelledBy
    // 5. EmailService.send(BOOKING_CANCELLED, ...)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async reschedule(
    sessionId: string,
    userId: string,
    role: string,
    data: RescheduleSessionInput,
  ) {
    // TODO: Implementar via /auto-flow execute
    // 1. Check 12h rule
    // 2. If student: set status RESCHEDULE_PENDING, persist new slot preference
    // 3. If admin: execute reschedule directly
    // 4. EmailService.send(BOOKING_RESCHEDULED, ...)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async approveReschedule(sessionId: string) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async bulkCancel(data: BulkCancelInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    // Find all SCHEDULED sessions in date range, cancel + refund each
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async listByStudent(studentId: string, status?: string) {
    // TODO: Implementar via /auto-flow execute
    return [];
  }

  async listAll(filters: {
    status?: string;
    hasFeedback?: boolean;
    page?: number;
    limit?: number;
  }) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    return { data: [], total: 0 };
  }

  async getById(sessionId: string, userId: string, role: string) {
    // TODO: Implementar via /auto-flow execute
    // Include iceServers config for WebRTC
    return null;
  }

  async autoConfirm(): Promise<void> {
    // TODO: Implementar via /auto-flow execute (cron job every 30 min)
    // Sessions with status IN_PROGRESS/SCHEDULED and endAt + 15min < NOW() → COMPLETED
  }

  // WebRTC signaling store (in-memory for MVP — replace with Redis in production)
  private signals = new Map<string, unknown[]>();

  async postSignal(sessionId: string, fromRole: string, signal: unknown) {
    // TODO: Store signal for the other peer to retrieve
    const key = `${sessionId}:${fromRole}`;
    const arr = this.signals.get(key) ?? [];
    arr.push(signal);
    this.signals.set(key, arr);
  }

  async pollSignals(sessionId: string, forRole: string): Promise<unknown[]> {
    // TODO: Return and clear signals for this peer
    const peerRole = forRole === 'STUDENT' ? 'ADMIN' : 'STUDENT';
    const key = `${sessionId}:${peerRole}`;
    const signals = this.signals.get(key) ?? [];
    this.signals.delete(key);
    return signals;
  }
}

export const sessionService = new SessionService();
