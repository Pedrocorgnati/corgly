import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { SUPPORTED_LANGUAGES } from '@/lib/assets/asset.schema';
import {
  TranscriptJobError,
  publishCaption,
} from '@/lib/assets/transcript-job.service';

/**
 * Publicacao de legenda por idioma (AD-25 / T-059).
 *
 * POST /api/v1/admin/assets/{id}/captions
 *   -> publica (READY) a legenda de um idioma especifico, separada das demais.
 *
 * Bloqueia se o transcript de origem ainda exige revisao manual (regra do
 * service). Cada idioma e publicado independentemente.
 */

const CAPTION_FORMATS = ['VTT', 'SRT', 'TXT'] as const;

// Publicar = promover a legenda já gerada pelo job a READY. `storageKey`/`content`
// são opcionais: quando ausentes, o service reaproveita o artefato persistido da
// legenda daquele idioma (CAPTION_NOT_GENERATED se não houver). Se enviados,
// `content` deve ser não-vazio (re-publicação com artefato novo).
const publishSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  format: z.enum(CAPTION_FORMATS).optional(),
  storageKey: z.string().max(500).optional(),
  publicUrl: z.string().url().max(1000).optional(),
  content: z.string().min(1).optional(),
});

function statusForTranscriptError(err: TranscriptJobError): number {
  switch (err.code) {
    case 'TRANSCRIPT_NOT_FOUND':
      return 404;
    case 'TRANSCRIPT_NOT_READY':
    case 'MANUAL_REVIEW_REQUIRED':
      return 409;
    default:
      return err.recoverable ? 422 : 400;
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Payload invalido.'),
      { status: 400 },
    );
  }

  try {
    const caption = await publishCaption({
      assetId: id,
      language: parsed.data.language,
      format: parsed.data.format,
      storageKey: parsed.data.storageKey,
      publicUrl: parsed.data.publicUrl,
      content: parsed.data.content,
    });

    return NextResponse.json(
      apiResponse(
        {
          captionId: caption.id,
          language: caption.language,
          format: caption.format,
          status: caption.status,
          publicUrl: caption.publicUrl,
        },
        null,
        'Legenda publicada.',
      ),
    );
  } catch (err) {
    if (err instanceof TranscriptJobError) {
      return NextResponse.json(
        apiResponse(null, err.message),
        { status: statusForTranscriptError(err) },
      );
    }
    return NextResponse.json(
      apiResponse(null, 'Erro ao publicar legenda.'),
      { status: 500 },
    );
  }
}
