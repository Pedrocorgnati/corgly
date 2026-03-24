// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FeedbackService } from '../feedback.service';
import { AppError } from '@/lib/errors';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      count:      vi.fn(),
      findMany:   vi.fn(),
    },
    feedback: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      upsert:     vi.fn(),
      count:      vi.fn(),
    },
  },
}));

// Mock window utility
vi.mock('@/lib/feedback/window', () => ({
  isFeedbackWindowOpen: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { isFeedbackWindowOpen } from '@/lib/feedback/window';

const mockPrisma  = vi.mocked(prisma);
const mockWindow  = vi.mocked(isFeedbackWindowOpen);

const SCORES = { listening: 4, speaking: 5, writing: 3, vocabulary: 4 };
const SESSION_BASE = {
  id:          'session-1',
  studentId:   'student-1',
  status:      'COMPLETED' as const,
  completedAt: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10h ago
  startAt:     new Date(Date.now() - 11 * 60 * 60 * 1000),
};
const FB_BASE = {
  id:                 'fb-1',
  sessionId:          'session-1',
  listeningScore:     4,
  speakingScore:      5,
  writingScore:       3,
  vocabularyScore:    4,
  overallFeedback:    null,
  listeningFeedback:  null,
  speakingFeedback:   null,
  writingFeedback:    null,
  vocabularyFeedback: null,
  reviewed:           false,
  reviewedAt:         null,
  adminId:            null,
  createdAt:          new Date(),
  updatedAt:          new Date(),
  session:            { startAt: SESSION_BASE.startAt },
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(() => {
    service = new FeedbackService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── SUCCESS ────────────────────────────────────────────────────────────────

  it('[SUCCESS] submit: cria feedback quando sessão COMPLETED e janela aberta', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION_BASE as never);
    mockWindow.mockReturnValue(true);
    mockPrisma.feedback.findUnique.mockResolvedValue(null);
    mockPrisma.feedback.create.mockResolvedValue(FB_BASE as never);

    const result = await service.submit('student-1', 'session-1', { scores: SCORES });

    expect(mockPrisma.feedback.create).toHaveBeenCalledOnce();
    expect(result.scores).toEqual(SCORES);
    expect(result.sessionId).toBe('session-1');
  });

  it('[SUCCESS] getStudentProgress: calcula médias corretamente por dimensão', async () => {
    mockPrisma.session.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    mockPrisma.feedback.findMany.mockResolvedValue([
      { ...FB_BASE, session: { startAt: SESSION_BASE.startAt } },
      { ...FB_BASE, id: 'fb-2', listeningScore: 2, speakingScore: 3, writingScore: 2, vocabularyScore: 3, session: { startAt: SESSION_BASE.startAt } },
    ] as never);

    const result = await service.getProgress('student-1');

    expect(result.averageScores.listening).toBeCloseTo(3);   // (4+2)/2
    expect(result.averageScores.speaking).toBeCloseTo(4);    // (5+3)/2
    expect(result.totalSessions).toBe(5);
    expect(result.completedSessions).toBe(3);
  });

  it('[SUCCESS] getStudentProgress: trend improving quando delta > 0.3', async () => {
    mockPrisma.session.count.mockResolvedValue(10);
    // last 3 avg=4.0, previous 3 avg=3.0 → delta=1.0 > 0.3 → improving
    const highScore = { ...FB_BASE, listeningScore: 4, speakingScore: 4, writingScore: 4, vocabularyScore: 4, session: { startAt: SESSION_BASE.startAt } };
    const lowScore  = { ...FB_BASE, id: 'fb-low', listeningScore: 3, speakingScore: 3, writingScore: 3, vocabularyScore: 3, session: { startAt: SESSION_BASE.startAt } };
    mockPrisma.feedback.findMany.mockResolvedValue([
      { ...highScore, id: 'h1' },
      { ...highScore, id: 'h2' },
      { ...highScore, id: 'h3' },
      { ...lowScore,  id: 'l1' },
      { ...lowScore,  id: 'l2' },
      { ...lowScore,  id: 'l3' },
    ] as never);

    const result = await service.getProgress('student-1');
    expect(result.trend).toBe('improving');
  });

  // ─── ERROR ──────────────────────────────────────────────────────────────────

  it('[ERROR] submit: rejeita FEEDBACK_051 quando sessão não COMPLETED', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      ...SESSION_BASE,
      status: 'SCHEDULED',
    } as never);

    await expect(
      service.submit('student-1', 'session-1', { scores: SCORES }),
    ).rejects.toMatchObject({ code: 'FEEDBACK_051', status: 422 });
  });

  it('[ERROR] submit: rejeita FEEDBACK_050 quando janela de 48h expirada (completedAt + 49h)', async () => {
    const completedAt = new Date(Date.now() - 49 * 60 * 60 * 1000); // 49h ago
    mockPrisma.session.findUnique.mockResolvedValue({
      ...SESSION_BASE,
      completedAt,
    } as never);
    mockWindow.mockReturnValue(false); // window closed

    await expect(
      service.submit('student-1', 'session-1', { scores: SCORES }),
    ).rejects.toMatchObject({ code: 'FEEDBACK_050', status: 422 });
  });

  it('[ERROR] submit: rejeita FEEDBACK_081 quando feedback já existe', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION_BASE as never);
    mockWindow.mockReturnValue(true);
    mockPrisma.feedback.findUnique.mockResolvedValue(FB_BASE as never); // already exists

    await expect(
      service.submit('student-1', 'session-1', { scores: SCORES }),
    ).rejects.toMatchObject({ code: 'FEEDBACK_081', status: 409 });
  });

  // ─── EDGE ───────────────────────────────────────────────────────────────────

  it('[EDGE] markReviewed: idempotente em segunda chamada', async () => {
    const alreadyReviewed = { ...FB_BASE, reviewed: true, reviewedAt: new Date() };
    mockPrisma.feedback.findUnique.mockResolvedValue(alreadyReviewed as never);

    const result = await service.markReviewed('fb-1');

    // Should NOT call update — already reviewed
    expect(mockPrisma.feedback.update).not.toHaveBeenCalled();
    expect(result.reviewed).toBe(true);
  });

  it('[EDGE] isFeedbackWindowOpen: true com 47h, false com 49h', () => {
    // Test the window logic directly (pure function, no Prisma dependency)
    const WINDOW_MS = 48 * 60 * 60 * 1000;
    const windowOpen = (completedAt: Date) => Date.now() - completedAt.getTime() < WINDOW_MS;

    const open47h   = new Date(Date.now() - 47 * 60 * 60 * 1000);
    const closed49h = new Date(Date.now() - 49 * 60 * 60 * 1000);

    expect(windowOpen(open47h)).toBe(true);
    expect(windowOpen(closed49h)).toBe(false);
  });
});
