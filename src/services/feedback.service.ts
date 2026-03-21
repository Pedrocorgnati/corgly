import { prisma } from '@/lib/prisma';
import type { CreateFeedbackInput } from '@/schemas/feedback.schema';

export class FeedbackService {
  async create(adminId: string, data: CreateFeedbackInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    // Validation window:
    //   1. Session.status === 'COMPLETED'
    //   2. Session.completedAt + 48h > NOW()
    //   3. Feedback for this sessionId does not exist
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async getBySession(sessionId: string) {
    // TODO: Implementar via /auto-flow execute
    return null;
  }

  async getProgress(studentId: string) {
    // TODO: Implementar via /auto-flow execute
    // Aggregate scores over time for charts
    return { sessions: [], averages: {} };
  }
}

export const feedbackService = new FeedbackService();
