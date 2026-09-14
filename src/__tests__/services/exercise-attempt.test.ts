/* eslint-disable @typescript-eslint/no-explicit-any -- Os mocks parciais do Prisma incluem apenas os campos exercitados. */
// @vitest-environment node

/**
 * Testes do ciclo de vida da tentativa de exercicio:
 * - criar tentativa com itemCount congelado
 * - salvar resposta e incrementar contadores
 * - encerrar tentativa e calcular score no servidor
 * - retomar tentativa IN_PROGRESS
 * - itemCount nao muda apos edicao do exercicio
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { exerciseService } from '@/services/exercise.service';

// Mock do Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      findUnique: vi.fn(),
    },
    exerciseItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    exerciseAssignment: {
      findUnique: vi.fn(),
    },
    exerciseAttempt: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    exerciseItemAnswer: {
      upsert: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      exerciseItemAnswer: {
        upsert: vi.fn(),
        count: vi.fn(),
      },
      exerciseAttempt: {
        update: vi.fn(),
      },
    })),
  },
}));

describe('ExerciseAttempt lifecycle', () => {
  const mockExerciseId = 'exercise-123';
  const mockStudentId = 'student-456';
  const mockAttemptId = 'attempt-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startOrResumeAttempt', () => {
    it('congela itemCount no momento da criacao', async () => {
      // Mock exercicio publicado com 5 itens
      vi.mocked(prisma.exercise.findUnique).mockResolvedValue({
        id: mockExerciseId,
        status: 'PUBLISHED',
        items: [
          { id: 'item-1' },
          { id: 'item-2' },
          { id: 'item-3' },
          { id: 'item-4' },
          { id: 'item-5' },
        ],
      } as any);

      // Mock assignment ativo
      vi.mocked(prisma.exerciseAssignment.findUnique).mockResolvedValue({
        id: 'assignment-1',
        status: 'ACTIVE',
      } as any);

      // Mock sem tentativa aberta
      vi.mocked(prisma.exerciseAttempt.findFirst).mockResolvedValue(null);

      // Mock criacao da tentativa
      vi.mocked(prisma.exerciseAttempt.create).mockResolvedValue({
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        assignmentId: 'assignment-1',
        itemCount: 5,
        status: 'IN_PROGRESS',
        answeredCount: 0,
        correctCount: 0,
        startedAt: new Date(),
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await exerciseService.startOrResumeAttempt(mockExerciseId, mockStudentId);

      expect(result.resumed).toBe(false);
      expect(result.attempt.itemCount).toBe(5);

      // Verificar que itemCount foi passado na criacao
      expect(prisma.exerciseAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemCount: 5,
          }),
        })
      );
    });

    it('retoma tentativa IN_PROGRESS existente', async () => {
      vi.mocked(prisma.exercise.findUnique).mockResolvedValue({
        id: mockExerciseId,
        status: 'PUBLISHED',
        items: [{ id: 'item-1' }],
      } as any);

      vi.mocked(prisma.exerciseAssignment.findUnique).mockResolvedValue({
        id: 'assignment-1',
        status: 'ACTIVE',
      } as any);

      // Mock tentativa ja existe
      const existingAttempt = {
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 5,
        answeredCount: 2,
        correctCount: 1,
        answers: [{ itemId: 'item-1' }, { itemId: 'item-2' }],
      };

      vi.mocked(prisma.exerciseAttempt.findFirst).mockResolvedValue(existingAttempt as any);

      const result = await exerciseService.startOrResumeAttempt(mockExerciseId, mockStudentId);

      expect(result.resumed).toBe(true);
      expect(result.attempt.id).toBe(mockAttemptId);
      expect(result.attempt.answeredCount).toBe(2);
      expect(result.attempt.answeredItemIds).toEqual(['item-1', 'item-2']);
    });
  });

  describe('submitAnswer', () => {
    it('rejeita tentativa ja finalizada', async () => {
      const mockAttempt = {
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'COMPLETED', // Ja finalizada
        itemCount: 5,
        answeredCount: 5,
        correctCount: 3,
        finishedAt: new Date(),
      };

      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue(mockAttempt as any);

      await expect(
        exerciseService.submitAnswer(
          mockExerciseId,
          mockAttemptId,
          mockStudentId,
          { itemId: 'item-1', answer: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 } }
        )
      ).rejects.toThrow('Tentativa ja finalizada');
    });

    it('faz upsert e reconta respostas sem incrementar uma segunda submissao', async () => {
      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue({
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 5,
        answeredCount: 1,
        correctCount: 1,
        finishedAt: null,
      } as any);
      vi.mocked(prisma.exerciseItem.findUnique).mockResolvedValue({
        id: 'item-1',
        exerciseId: mockExerciseId,
        kind: 'MULTIPLE_CHOICE',
        answerKey: { correctIndex: 0 },
        acceptWithoutAccent: false,
      } as any);

      const mockTx = {
        exerciseItemAnswer: {
          upsert: vi.fn(),
          count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        },
        exerciseAttempt: {
          update: vi.fn().mockResolvedValue({
            answeredCount: 1,
            correctCount: 1,
            itemCount: 5,
          }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation((fn) => fn(mockTx as any));

      const result = await exerciseService.submitAnswer(
        mockExerciseId,
        mockAttemptId,
        mockStudentId,
        { itemId: 'item-1', answer: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 } },
      );

      expect(mockTx.exerciseItemAnswer.upsert).toHaveBeenCalledTimes(1);
      expect(mockTx.exerciseItemAnswer.count).toHaveBeenCalledTimes(2);
      expect(mockTx.exerciseAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { answeredCount: 1, correctCount: 1 } }),
      );
      expect(result).toMatchObject({ answeredCount: 1, correctCount: 1, itemCount: 5 });
    });
  });

  describe('finishAttempt', () => {
    it('calcula score no servidor', async () => {
      const mockAttempt = {
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 5,
        answeredCount: 0,
        correctCount: 0,
        finishedAt: null,
      };

      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue(mockAttempt as any);

      // Mock transacao
      const mockTx = {
        exerciseItemAnswer: {
          count: vi.fn()
            .mockResolvedValueOnce(4) // answeredCount
            .mockResolvedValueOnce(3), // correctCount
        },
        exerciseAttempt: {
          update: vi.fn().mockResolvedValue({
            id: mockAttemptId,
            status: 'IN_PROGRESS',
            answeredCount: 4,
            correctCount: 3,
            itemCount: 5,
            finishedAt: new Date(),
          }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation((fn) => fn(mockTx as any));

      vi.mocked(prisma.exerciseItem.findMany).mockResolvedValue([
        {
          id: 'item-1',
          kind: 'MULTIPLE_CHOICE',
          position: 1,
          payload: { prompt: 'Test?', options: ['A', 'B', 'C', 'D'] },
          answerKey: { correctIndex: 0 },
          answers: [{ payload: { kind: 'MULTIPLE_CHOICE', selectedIndex: 0 }, isCorrect: true, answeredAt: new Date() }],
        },
      ] as any);

      const result = await exerciseService.finishAttempt(
        mockExerciseId,
        mockAttemptId,
        mockStudentId
      );

      expect(result.answeredCount).toBe(4);
      expect(result.correctCount).toBe(3);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.score).toBe(0.75);
      expect(result.scorePercent).toBe(75);
    });
  });

  describe('closeAttempt', () => {
    it('mantem tentativa parcial em andamento e calcula score no servidor', async () => {
      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue({
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 5,
        answeredCount: 2,
        correctCount: 1,
        finishedAt: null,
      } as any);

      const mockTx = {
        exerciseItemAnswer: {
          count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        },
        exerciseAttempt: {
          update: vi.fn().mockResolvedValue({
            id: mockAttemptId,
            status: 'IN_PROGRESS',
            answeredCount: 2,
            correctCount: 1,
            itemCount: 5,
            finishedAt: null,
          }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation((fn) => fn(mockTx as any));

      const result = await exerciseService.closeAttempt(mockAttemptId, mockStudentId);

      expect(result).toMatchObject({
        status: 'IN_PROGRESS',
        answeredCount: 2,
        correctCount: 1,
        score: 0.5,
        scorePercent: 50,
      });
      expect(mockTx.exerciseAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS', finishedAt: null }),
        }),
      );
    });

    it('marca tentativa completa como COMPLETED', async () => {
      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue({
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 2,
        answeredCount: 2,
        correctCount: 1,
        finishedAt: null,
      } as any);

      const mockTx = {
        exerciseItemAnswer: {
          count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        },
        exerciseAttempt: {
          update: vi.fn().mockResolvedValue({
            id: mockAttemptId,
            status: 'COMPLETED',
            answeredCount: 2,
            correctCount: 1,
            itemCount: 2,
            finishedAt: new Date(),
          }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation((fn) => fn(mockTx as any));

      const result = await exerciseService.closeAttempt(mockAttemptId, mockStudentId);

      expect(result.status).toBe('COMPLETED');
      expect(result.scorePercent).toBe(50);
    });
  });

  describe('itemCount congelado', () => {
    it('nao muda quando admin edita o exercicio depois da tentativa iniciada', async () => {
      // Tentativa criada com 5 itens
      const mockAttempt = {
        id: mockAttemptId,
        exerciseId: mockExerciseId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        itemCount: 5, // Congelado no momento da criacao
        answeredCount: 2,
        correctCount: 1,
        finishedAt: null,
      };

      vi.mocked(prisma.exerciseAttempt.findUnique).mockResolvedValue(mockAttempt as any);

      // Agora o exercicio tem 7 itens (admin adicionou 2)
      vi.mocked(prisma.exerciseItem.findMany).mockResolvedValue([
        { id: 'item-1', kind: 'MULTIPLE_CHOICE', position: 1, payload: {}, answerKey: {}, answers: [] },
        { id: 'item-2', kind: 'MULTIPLE_CHOICE', position: 2, payload: {}, answerKey: {}, answers: [] },
        { id: 'item-3', kind: 'MULTIPLE_CHOICE', position: 3, payload: {}, answerKey: {}, answers: [] },
        { id: 'item-4', kind: 'MULTIPLE_CHOICE', position: 4, payload: {}, answerKey: {}, answers: [] },
        { id: 'item-5', kind: 'MULTIPLE_CHOICE', position: 5, payload: {}, answerKey: {}, answers: [] },
        { id: 'item-6', kind: 'MULTIPLE_CHOICE', position: 6, payload: {}, answerKey: {}, answers: [] }, // Novo
        { id: 'item-7', kind: 'MULTIPLE_CHOICE', position: 7, payload: {}, answerKey: {}, answers: [] }, // Novo
      ] as any);

      vi.mocked(prisma.exercise.findUnique).mockResolvedValue({
        id: mockExerciseId,
        supportLanguage: 'EN_US',
        translations: [{ locale: 'EN_US', title: 'Test Exercise' }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ preferredLanguage: 'EN_US' } as any);

      const result = await exerciseService.getAttemptSummary(
        mockExerciseId,
        mockAttemptId,
        mockStudentId
      );

      // itemCount permanece 5, o valor congelado na criacao
      expect(result.attempt.itemCount).toBe(5);
    });
  });
});
