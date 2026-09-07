import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const MAX_ACTIVE_PATTERNS = 3;

const CreateRecurringPatternSchema = z.object({
  // O padrão é criado PARA um aluno, não pelo aluno: o dono vem explícito no
  // corpo (mesmo contrato de `credits/manual`), nunca de `auth.id`.
  studentId: z.string().uuid('studentId invalido.'),
  dayOfWeek: z.number().int().min(0).max(6), // 0=Dom, 6=Sáb
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM esperado'),
});

/** GET /api/v1/recurring-patterns — lista padrões ativos (admin; filtro opcional por aluno) */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const studentId = request.nextUrl.searchParams.get('studentId');

  try {
    const patterns = await prisma.recurringPattern.findMany({
      where: { isActive: true, ...(studentId ? { studentId } : {}) },
      orderBy: { studentId: 'asc', dayOfWeek: 'asc' },
    });

    return NextResponse.json(apiResponse(patterns));
  } catch (err) {
    logger.error(
      'GET /api/v1/recurring-patterns',
      { action: 'patterns.list', userId: auth.id, targetStudentId: studentId ?? null },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/recurring-patterns — cria novo padrão de recorrência para um aluno */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = CreateRecurringPatternSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
        { status: 400 },
      );
    }

    const { studentId, dayOfWeek, startTime } = parsed.data;

    // Alvo validado ANTES dos limites: contar padrões de um id inexistente
    // devolveria 0 e o create morreria em erro de FK, sem mensagem útil.
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true },
    });
    if (!student) {
      throw new AppError('PATTERN_003', 'Aluno nao encontrado.', 404);
    }
    if (student.role !== 'STUDENT') {
      throw new AppError('PATTERN_004', 'Alvo do padrao deve ser um aluno.', 400);
    }

    // Limite de 3 padrões ativos por aluno
    const activeCount = await prisma.recurringPattern.count({
      where: { studentId, isActive: true },
    });
    if (activeCount >= MAX_ACTIVE_PATTERNS) {
      throw new AppError(
        'PATTERN_001',
        `Limite de ${MAX_ACTIVE_PATTERNS} padrões ativos atingido.`,
        400,
      );
    }

    // Evitar duplicata (mesmo dayOfWeek + startTime)
    const existing = await prisma.recurringPattern.findFirst({
      where: { studentId, dayOfWeek, startTime, isActive: true },
    });
    if (existing) {
      throw new AppError('PATTERN_002', 'Padrão com este dia e horário já existe.', 409);
    }

    const pattern = await prisma.recurringPattern.create({
      data: { studentId, dayOfWeek, startTime },
    });

    return NextResponse.json(apiResponse(pattern), { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
