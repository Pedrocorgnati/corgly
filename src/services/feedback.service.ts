import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { isFeedbackWindowOpen } from '@/lib/feedback/window';
import type { FeedbackScores, SubmitFeedbackInput, AdminSubmitFeedbackInput } from '@/schemas/feedback.schema';

import { PAGINATION } from '@/lib/constants';
export interface FeedbackItem {
  id: string;
  sessionId: string;
  sessionDate: Date;
  scores: FeedbackScores;
  averageScore: number;
  overallFeedback: string | null;
  listeningFeedback: string | null;
  speakingFeedback: string | null;
  writingFeedback: string | null;
  vocabularyFeedback: string | null;
  reviewed: boolean;
  reviewedAt: Date | null;
  adminId: string | null;
  createdAt: Date;
}

export interface ProgressData {
  averageScores: FeedbackScores;
  totalSessions: number;
  completedSessions: number;
  trend: 'improving' | 'stable' | 'declining';
  lastFeedbacks: FeedbackItem[];
}

export interface FeedbackListResult {
  items: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
}

/** Maps a raw Prisma Feedback row to the canonical FeedbackItem shape. */
function mapFeedback(fb: {
  id: string;
  sessionId: string;
  listeningScore: number;
  speakingScore: number;
  writingScore: number;
  vocabularyScore: number;
  overallFeedback: string | null;
  listeningFeedback: string | null;
  speakingFeedback: string | null;
  writingFeedback: string | null;
  vocabularyFeedback: string | null;
  reviewed: boolean;
  reviewedAt: Date | null;
  adminId: string | null;
  createdAt: Date;
  session: { startAt: Date };
}): FeedbackItem {
  const scores: FeedbackScores = {
    listening:  fb.listeningScore,
    speaking:   fb.speakingScore,
    writing:    fb.writingScore,
    vocabulary: fb.vocabularyScore,
  };
  const averageScore =
    (fb.listeningScore + fb.speakingScore + fb.writingScore + fb.vocabularyScore) / 4;

  return {
    id:                 fb.id,
    sessionId:          fb.sessionId,
    sessionDate:        fb.session.startAt,
    scores,
    averageScore,
    overallFeedback:    fb.overallFeedback,
    listeningFeedback:  fb.listeningFeedback,
    speakingFeedback:   fb.speakingFeedback,
    writingFeedback:    fb.writingFeedback,
    vocabularyFeedback: fb.vocabularyFeedback,
    reviewed:           fb.reviewed,
    reviewedAt:         fb.reviewedAt,
    adminId:            fb.adminId,
    createdAt:          fb.createdAt,
  };
}

export class FeedbackService {
  /**
   * Student submits feedback for a completed session.
   * Validates: exists → owner → COMPLETED → window → not duplicate → creates.
   */
  async submit(studentId: string, sessionId: string, data: SubmitFeedbackInput): Promise<FeedbackItem> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, studentId: true, status: true, completedAt: true, startAt: true },
    });

    if (!session) {
      throw new AppError('FEEDBACK_001', 'Sessão não encontrada.', 404);
    }
    if (session.studentId !== studentId) {
      throw new AppError('FEEDBACK_001', 'Acesso negado.', 403);
    }
    if (session.status !== 'COMPLETED') {
      throw new AppError('FEEDBACK_051', 'Sessão não concluída.', 422);
    }
    if (!session.completedAt || !isFeedbackWindowOpen(session.completedAt)) {
      throw new AppError('FEEDBACK_050', 'Janela de avaliação encerrada (48h).', 422);
    }

    const existing = await prisma.feedback.findUnique({ where: { sessionId } });
    if (existing) {
      throw new AppError('FEEDBACK_081', 'Avaliação já enviada para esta sessão.', 409);
    }

    const fb = await prisma.feedback.create({
      data: {
        sessionId,
        listeningScore:     data.scores.listening,
        speakingScore:      data.scores.speaking,
        writingScore:       data.scores.writing,
        vocabularyScore:    data.scores.vocabulary,
        overallFeedback:    data.overallFeedback ?? null,
        listeningFeedback:  data.listeningFeedback ?? null,
        speakingFeedback:   data.speakingFeedback ?? null,
        writingFeedback:    data.writingFeedback ?? null,
        vocabularyFeedback: data.vocabularyFeedback ?? null,
      },
      include: { session: { select: { startAt: true } } },
    });

    return mapFeedback(fb);
  }

  /**
   * Admin submits or updates feedback (upsert by sessionId).
   * Validates: session COMPLETED + window open.
   */
  async adminSubmit(
    adminId: string,
    sessionId: string,
    data: AdminSubmitFeedbackInput,
  ): Promise<FeedbackItem> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, completedAt: true, startAt: true },
    });

    if (!session) {
      throw new AppError('FEEDBACK_001', 'Sessão não encontrada.', 404);
    }
    if (session.status !== 'COMPLETED') {
      throw new AppError('FEEDBACK_051', 'Sessão não concluída.', 422);
    }
    if (!session.completedAt || !isFeedbackWindowOpen(session.completedAt)) {
      throw new AppError('FEEDBACK_050', 'Janela de avaliação encerrada (48h).', 422);
    }

    const fb = await prisma.feedback.upsert({
      where:  { sessionId },
      create: {
        sessionId,
        adminId,
        listeningScore:     data.scores.listening,
        speakingScore:      data.scores.speaking,
        writingScore:       data.scores.writing,
        vocabularyScore:    data.scores.vocabulary,
        overallFeedback:    data.overallFeedback ?? null,
        listeningFeedback:  data.listeningFeedback ?? null,
        speakingFeedback:   data.speakingFeedback ?? null,
        writingFeedback:    data.writingFeedback ?? null,
        vocabularyFeedback: data.vocabularyFeedback ?? null,
        privateNote:        data.privateNote ?? null,
      },
      update: {
        adminId,
        listeningScore:     data.scores.listening,
        speakingScore:      data.scores.speaking,
        writingScore:       data.scores.writing,
        vocabularyScore:    data.scores.vocabulary,
        overallFeedback:    data.overallFeedback ?? null,
        listeningFeedback:  data.listeningFeedback ?? null,
        speakingFeedback:   data.speakingFeedback ?? null,
        writingFeedback:    data.writingFeedback ?? null,
        vocabularyFeedback: data.vocabularyFeedback ?? null,
        privateNote:        data.privateNote ?? null,
      },
      include: { session: { select: { startAt: true } } },
    });

    return mapFeedback(fb);
  }

  /**
   * Fetches feedback for a specific session. Returns null if not found.
   * Admin sees privateNote; students do not.
   */
  async getBySession(sessionId: string, includePrivate = false): Promise<FeedbackItem | null> {
    const fb = await prisma.feedback.findUnique({
      where: { sessionId },
      include: { session: { select: { startAt: true } } },
    });

    if (!fb) return null;

    const item = mapFeedback(fb);
    if (!includePrivate) {
      // Strip private data
      return { ...item };
    }
    return { ...item, overallFeedback: fb.privateNote ?? item.overallFeedback };
  }

  /**
   * Lists feedbacks for a student (paginated).
   */
  async listForStudent(
    studentId: string,
    page: number,
    limit: number,
    sessionId?: string,
  ): Promise<FeedbackListResult> {
    const where = {
      session: { studentId },
      ...(sessionId ? { sessionId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: { session: { select: { startAt: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return { items: items.map(mapFeedback), total, page, limit };
  }

  /**
   * Lists all feedbacks (admin, paginated).
   */
  async listAll(
    page: number,
    limit: number,
    reviewed?: boolean,
    studentId?: string,
  ): Promise<FeedbackListResult> {
    const where = {
      ...(reviewed !== undefined ? { reviewed } : {}),
      ...(studentId ? { session: { studentId } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: { session: { select: { startAt: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return { items: items.map(mapFeedback), total, page, limit };
  }

  /**
   * Returns progress data for a student: averages, trend, last 3 feedbacks.
   * Uses last 10 sessions with feedback for averages.
   */
  async getProgress(studentId: string): Promise<ProgressData> {
    const [totalSessions, completedSessions, feedbacks] = await Promise.all([
      prisma.session.count({ where: { studentId } }),
      prisma.session.count({ where: { studentId, status: 'COMPLETED' } }),
      prisma.feedback.findMany({
        where:   { session: { studentId } },
        include: { session: { select: { startAt: true } } },
        orderBy: { createdAt: 'desc' },
        take:    PAGINATION.DASHBOARD_RECENT,
      }),
    ]);

    const items = feedbacks.map(mapFeedback);

    if (items.length === 0) {
      const zero: FeedbackScores = { listening: 0, speaking: 0, writing: 0, vocabulary: 0 };
      return { averageScores: zero, totalSessions, completedSessions, trend: 'stable', lastFeedbacks: [] };
    }

    // Compute averages over last 10
    const avg = (key: keyof FeedbackScores) =>
      items.reduce((s, f) => s + f.scores[key], 0) / items.length;

    const averageScores: FeedbackScores = {
      listening:  parseFloat(avg('listening').toFixed(2)),
      speaking:   parseFloat(avg('speaking').toFixed(2)),
      writing:    parseFloat(avg('writing').toFixed(2)),
      vocabulary: parseFloat(avg('vocabulary').toFixed(2)),
    };

    // Trend: compare avg of last 3 vs previous 3
    const trend = this._computeTrend(items);

    return {
      averageScores,
      totalSessions,
      completedSessions,
      trend,
      lastFeedbacks: items.slice(0, 3),
    };
  }

  /**
   * Marks a feedback as reviewed (idempotent).
   */
  async markReviewed(feedbackId: string): Promise<FeedbackItem> {
    const existing = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: { session: { select: { startAt: true } } },
    });

    if (!existing) {
      throw new AppError('FEEDBACK_001', 'Feedback não encontrado.', 404);
    }

    if (existing.reviewed) {
      // Idempotent: already reviewed, return current state
      return mapFeedback(existing);
    }

    const fb = await prisma.feedback.update({
      where: { id: feedbackId },
      data:  { reviewed: true, reviewedAt: new Date() },
      include: { session: { select: { startAt: true } } },
    });

    return mapFeedback(fb);
  }

  /**
   * Returns paginated feedback history for a student (for charts).
   */
  async getHistory(
    studentId: string,
    period: '30d' | '90d' | 'all',
    page: number,
    limit: number,
  ): Promise<{ items: FeedbackItem[]; total: number }> {
    const fromDate = period === '30d'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : period === '90d'
      ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      : undefined;

    const where = {
      session: { studentId },
      ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: { session: { select: { startAt: true } } },
        orderBy: { createdAt: 'asc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return { items: items.map(mapFeedback), total };
  }

  /** Delta > +0.3 → improving | < -0.3 → declining | else → stable */
  private _computeTrend(items: FeedbackItem[]): 'improving' | 'stable' | 'declining' {
    if (items.length < 4) return 'stable';

    const avg3 = (slice: FeedbackItem[]) => {
      const sum = slice.reduce((s, f) => s + f.averageScore, 0);
      return sum / slice.length;
    };

    const recent   = avg3(items.slice(0, 3));
    const previous = avg3(items.slice(3, 6));
    const delta    = recent - previous;

    if (delta > 0.3)  return 'improving';
    if (delta < -0.3) return 'declining';
    return 'stable';
  }
}

export const feedbackService = new FeedbackService();
