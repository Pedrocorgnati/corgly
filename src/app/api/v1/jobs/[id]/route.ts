import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { getJobById } from '@/lib/jobs/job.service';

/**
 * Status autorizado de um job assíncrono (T-056, PRD §13.6).
 *
 * GET /api/v1/jobs/:id
 *   Retorna o estado operacional de um job (status, tentativas, erro resumido).
 *   Autorização: dono do job (`createdById`) ou perfil ADMIN. O `payload` NUNCA
 *   é exposto (pode conter PII/segredo de DSR/transcrição); apenas metadados de
 *   execução são retornados. `finalErrorMessage` já vem redigido pelo runner.
 *
 * Status codes: 401 não autenticado, 403 sem permissão, 404 job inexistente
 *   ou id inválido (não revela existência a terceiros), 500 erro interno.
 */

const idSchema = z.string().uuid();

const ADMIN_ROLE = 'ADMIN';

interface JobStatusView {
  id: string;
  type: string;
  status: string;
  queueName: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  finalErrorCode: string | null;
  finalErrorMessage: string | null;
  finalErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toStatusView(job: {
  id: string;
  type: string;
  status: string;
  queueName: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  finalErrorCode: string | null;
  finalErrorMessage: string | null;
  finalErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): JobStatusView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    queueName: job.queueName,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    scheduledAt: job.scheduledAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    finalErrorCode: job.finalErrorCode,
    finalErrorMessage: job.finalErrorMessage,
    finalErrorAt: job.finalErrorAt ? job.finalErrorAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    // Id malformado: tratar como não encontrado para não vazar formato interno.
    return NextResponse.json(apiResponse(null, 'Job não encontrado.'), { status: 404 });
  }

  const job = await getJobById(parsedId.data);
  if (!job) {
    return NextResponse.json(apiResponse(null, 'Job não encontrado.'), { status: 404 });
  }

  const isOwner = job.createdById !== null && job.createdById === auth.id;
  const isAdmin = auth.role === ADMIN_ROLE;
  if (!isOwner && !isAdmin) {
    return NextResponse.json(apiResponse(null, 'Acesso negado.'), { status: 403 });
  }

  return NextResponse.json(apiResponse(toStatusView(job)), { status: 200 });
});
