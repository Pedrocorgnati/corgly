/**
 * POST /api/v1/exercises/[id]/attempts/[attemptId]/answers - responde um item
 *
 * Unica rota do dominio com rate limit. A chave e o `userId`, nao o IP: a defesa
 * e contra flood de um aluno autenticado, e escola atras de NAT compartilha IP -
 * limitar por IP puniria a turma inteira por causa de um aluno.
 *
 * `checkRateLimit` e fail-open (Redis fora do ar libera a requisicao). Por isso
 * o teste do 429 mocka `checkRateLimit`: em ambiente sem Redis o caminho de
 * bloqueio nunca seria exercitado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireStudent } from '@/lib/auth-guard';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { submitAnswerSchema } from '@/schemas/exercise.schema';
import { exerciseService, statusForAppError } from '@/services/exercise.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id, attemptId } = await params;

  const rl = await checkRateLimit(
    `exercise-answer:${auth.id}`,
    RATE_LIMITS.EXERCISE_ANSWER_SUBMIT,
  );

  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas respostas em sequencia. Aguarde um momento.'),
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON invalido.'), { status: 400 });
  }

  const parsed = submitAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  try {
    const result = await exerciseService.submitAnswer(id, attemptId, auth.id, parsed.data);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    return NextResponse.json(
      apiResponse(null, err instanceof Error ? err.message : 'Erro ao registrar resposta.'),
      { status: statusForAppError(err) },
    );
  }
}
