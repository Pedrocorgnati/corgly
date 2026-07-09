import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { SUPPORTED_LANGUAGES } from '@/lib/assets/asset.schema';
import {
  TranscriptJobError,
  dispatchTranscriptionJob,
  getTranscriptionJobStatus,
} from '@/lib/assets/transcript-job.service';

/**
 * Admin de transcricao de assets (AD-24 / AD-25 / T-059).
 *
 * GET  /api/v1/admin/assets/{id}/transcription
 *   -> estado consolidado (jobs + transcripts + captions + recuperabilidade).
 * POST /api/v1/admin/assets/{id}/transcription
 *   -> dispara um job de transcricao para um idioma.
 *
 * Toda a logica de negocio vive em `transcript-job.service`; esta rota apenas
 * autentica (admin), valida input e mapeia `TranscriptJobError` para HTTP.
 */

const dispatchSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  provider: z.string().max(80).optional().nullable(),
  generateCaptions: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

/** Mapeia o erro de dominio para um status HTTP coerente com a recuperabilidade. */
function statusForTranscriptError(err: TranscriptJobError): number {
  switch (err.code) {
    case 'ASSET_NOT_FOUND':
    case 'TRANSCRIPT_NOT_FOUND':
      return 404;
    case 'ASSET_ARCHIVED':
      return 409;
    default:
      // Recuperavel -> 422 (operador pode corrigir e reenviar); fatal -> 400.
      return err.recoverable ? 422 : 400;
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const status = await getTranscriptionJobStatus(id);
    return NextResponse.json(apiResponse(status));
  } catch (err) {
    if (err instanceof TranscriptJobError) {
      return NextResponse.json(
        apiResponse(null, err.message),
        { status: statusForTranscriptError(err) },
      );
    }
    return NextResponse.json(
      apiResponse(null, 'Erro ao carregar status da transcricao.'),
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = dispatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Payload invalido.'),
      { status: 400 },
    );
  }

  try {
    const result = await dispatchTranscriptionJob({
      assetId: id,
      language: parsed.data.language,
      provider: parsed.data.provider ?? undefined,
      generateCaptions: parsed.data.generateCaptions,
      priority: parsed.data.priority,
      requestedById: auth.id,
    });

    return NextResponse.json(
      apiResponse(
        {
          jobId: result.job.id,
          jobStatus: result.job.status,
          provider: result.provider,
          manualFallback: result.manualFallback,
        },
        null,
        result.manualFallback
          ? 'Job enfileirado: idioma fora do conjunto automatico, sera rebaixado para revisao manual.'
          : 'Transcricao enfileirada com sucesso.',
      ),
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof TranscriptJobError) {
      return NextResponse.json(
        apiResponse(null, err.message),
        { status: statusForTranscriptError(err) },
      );
    }
    return NextResponse.json(
      apiResponse(null, 'Erro ao enfileirar transcricao.'),
      { status: 500 },
    );
  }
}
