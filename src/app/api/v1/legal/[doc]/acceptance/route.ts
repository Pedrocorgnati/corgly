import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { detectLocale } from '@/lib/detect-locale';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  getAcceptanceStatus,
  recordAcceptance,
  resolveDocType,
  toLegalLocale,
} from '@/lib/legal/legal.service';
import { legalDocVersionSchema } from '@/lib/legal/legal.schema';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ doc: string }> };

const acceptanceBodySchema = z.object({
  version: legalDocVersionSchema,
});

function resolveLocale(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  request: NextRequest,
) {
  return toLegalLocale(
    detectLocale(cookieStore, request.headers.get('accept-language') ?? undefined),
  );
}

/**
 * GET /api/v1/legal/[doc]/acceptance  (GL-19 / T-046)
 *
 * Status de aceite do usuario autenticado para o documento ativo de `doc`
 * (terms | privacy | cookies). Consumido pelo `TermsAcceptanceGate` para decidir
 * o bloqueio. Devolve o documento ativo (com `content`) e o flag `accepted`,
 * calculado por (user, type, version ativa) - nunca por timestamp.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { doc: docParam } = await context.params;
  const type = resolveDocType(docParam);
  if (!type) {
    return NextResponse.json(
      apiResponse(null, `Documento legal desconhecido: ${docParam}.`),
      { status: 404 },
    );
  }

  try {
    const cookieStore = await cookies();
    const locale = resolveLocale(cookieStore, request);
    const status = await getAcceptanceStatus(auth.id, type, locale);

    return NextResponse.json(
      apiResponse({
        doc: docParam.toLowerCase(),
        satisfied: status.satisfied,
        accepted: status.accepted,
        accepted_version: status.acceptedVersion,
        accepted_at: status.acceptedAt,
        document: status.doc
          ? {
              type: status.doc.type,
              locale: status.doc.locale,
              version: status.doc.version,
              hash: status.doc.hash,
              content: status.doc.content,
              title: status.doc.title,
              required_since: status.doc.requiredSince,
              requires_acceptance: status.doc.requiresAcceptance,
            }
          : null,
      }),
    );
  } catch (err) {
    logger.error(
      'GET /api/v1/legal/[doc]/acceptance',
      { userId: auth.id, action: 'legal_acceptance_status', doc: docParam },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao consultar o status de aceite. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/legal/[doc]/acceptance  (GL-19 / T-046)
 *
 * Registra o aceite do usuario autenticado para a `version` ativa do documento.
 * Captura `ip` (hashed SHA-256) e `user_agent` para auditoria. Idempotente por
 * (user, doc, version): re-aceitar a mesma versao retorna 200 sem duplicar.
 * Versao divergente da ativa -> 409 (evita aceitar documento defasado).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { doc: docParam } = await context.params;
  const type = resolveDocType(docParam);
  if (!type) {
    return NextResponse.json(
      apiResponse(null, `Documento legal desconhecido: ${docParam}.`),
      { status: 404 },
    );
  }

  const limit = await checkRateLimit(`legal:accept:${auth.id}`, RATE_LIMITS.GENERAL);
  if (!limit.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitacoes. Tente novamente em alguns instantes.'),
      { status: 429 },
    );
  }

  let parsedBody: z.infer<typeof acceptanceBodySchema>;
  try {
    const raw = await request.json();
    parsedBody = acceptanceBodySchema.parse(raw);
  } catch {
    return NextResponse.json(
      apiResponse(null, 'Requisicao invalida: informe a versao do documento aceito.'),
      { status: 422 },
    );
  }

  try {
    const cookieStore = await cookies();
    const locale = resolveLocale(cookieStore, request);
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = request.headers.get('user-agent');

    const result = await recordAcceptance({
      userId: auth.id,
      type,
      locale,
      version: parsedBody.version,
      ip,
      userAgent,
      source: 'LOGIN_BLOCKER',
    });

    if (!result.ok) {
      if (result.reason === 'no_active_doc') {
        return NextResponse.json(
          apiResponse(null, 'Nao ha documento ativo para aceite.'),
          { status: 404 },
        );
      }
      // version_mismatch: cliente tentou aceitar versao que nao esta mais ativa.
      return NextResponse.json(
        apiResponse(null, 'A versao informada nao corresponde ao documento vigente. Recarregue a pagina.'),
        { status: 409 },
      );
    }

    logger.info('legal.acceptance.recorded', {
      userId: auth.id,
      action: 'legal_acceptance_record',
      doc: docParam,
    });

    return NextResponse.json(
      apiResponse(
        {
          accepted: true,
          doc: docParam.toLowerCase(),
          version: result.version,
          accepted_at: result.acceptedAt,
          idempotent: result.idempotentHit,
        },
        null,
        result.idempotentHit ? 'Aceite ja registrado.' : 'Aceite registrado com sucesso.',
      ),
    );
  } catch (err) {
    logger.error(
      'POST /api/v1/legal/[doc]/acceptance',
      { userId: auth.id, action: 'legal_acceptance_record', doc: docParam },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao registrar o aceite. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
