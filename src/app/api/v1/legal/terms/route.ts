import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { detectLocale } from '@/lib/detect-locale';
import { getActiveLegalDoc, toLegalLocale } from '@/lib/legal/legal.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/legal/terms  (GL-19 / T-046)
 *
 * Rota canonica de leitura do documento ATIVO do tipo `terms`. Resolve o locale
 * via cookie/Accept-Language (fallback PT_BR). A resposta segue o contrato
 * reutilizado pelos demais tipos (privacy, cookies) na rota dinamica:
 *   { type, locale, version, hash, content, title, required_since, requires_acceptance }
 *
 * `required_since` (effectiveAt) e metadado informativo/auditoria, nunca o
 * criterio de bloqueio - quem decide aceite e a `version`.
 *
 * Leitura publica: os termos vigentes precisam ser legiveis antes do login.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const locale = detectLocale(
      cookieStore,
      request.headers.get('accept-language') ?? undefined,
    );
    const doc = await getActiveLegalDoc('TERMS', toLegalLocale(locale));

    if (!doc) {
      // Empty determinado: nao ha termos ativos publicados.
      return NextResponse.json(
        apiResponse({ active: false, document: null }),
      );
    }

    return NextResponse.json(
      apiResponse({
        active: true,
        document: {
          type: doc.type,
          locale: doc.locale,
          version: doc.version,
          hash: doc.hash,
          content: doc.content,
          title: doc.title,
          required_since: doc.requiredSince,
          requires_acceptance: doc.requiresAcceptance,
        },
      }),
    );
  } catch (err) {
    logger.error(
      'GET /api/v1/legal/terms',
      { action: 'legal_terms_read' },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao carregar os termos. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
