import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const MAX_ACTIVE_PATTERNS = 3;

const CreateRecurringPatternSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0=Dom, 6=Sáb
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM esperado'),
});

/** GET /api/v1/recurring-patterns — lista padrões ativos do aluno autenticado */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const patterns = await prisma.recurringPattern.findMany({
      where: { studentId: auth.id, isActive: true },
      orderBy: { dayOfWeek: 'asc' },
    });

    return NextResponse.json(apiResponse(patterns));
  } catch (err) {
    logger.error('GET /api/v1/recurring-patterns', { action: 'patterns.list', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/recurring-patterns — cria novo padrão de recorrência */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
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

    const { dayOfWeek, startTime } = parsed.data;

    // Limite de 3 padrões ativos por aluno
    const activeCount = await prisma.recurringPattern.count({
      where: { studentId: auth.id, isActive: true },
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
      where: { studentId: auth.id, dayOfWeek, startTime, isActive: true },
    });
    if (existing) {
      throw new AppError('PATTERN_002', 'Padrão com este dia e horário já existe.', 409);
    }

    const pattern = await prisma.recurringPattern.create({
      data: { studentId: auth.id, dayOfWeek, startTime },
    });

    return NextResponse.json(apiResponse(pattern), { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
