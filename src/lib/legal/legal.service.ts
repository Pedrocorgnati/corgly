import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { SupportedLocale } from '@/lib/detect-locale';
import {
  legalDocTypeSchema,
  legalAcceptanceSourceSchema,
  type LegalDocType,
  type LegalDocLocale,
  type LegalAcceptanceSource,
} from '@/lib/legal/legal.schema';

/**
 * Service de documentos legais versionados e aceite bloqueante (GL-19 / T-046).
 *
 * Consome a entidade entregue por T-011 (`legal_docs` + `term_acceptances`).
 * Regra canonica de bloqueio: decide por (type, version), NUNCA por timestamp.
 * `effectiveAt` (required_since) e devolvido apenas como metadado de auditoria.
 */

const DOC_PARAM_TO_TYPE: Record<string, LegalDocType> = {
  terms: 'TERMS',
  privacy: 'PRIVACY',
  cookies: 'COOKIES',
};

/** Tipos de documento aceitaveis pela rota dinamica `[doc]`. */
export const ACCEPTABLE_DOC_PARAMS = Object.keys(DOC_PARAM_TO_TYPE);

/** Converte o segmento de rota (`terms`/`privacy`/`cookies`) no enum do Prisma. */
export function resolveDocType(docParam: string): LegalDocType | null {
  return DOC_PARAM_TO_TYPE[docParam.toLowerCase()] ?? null;
}

const LOCALE_MAP: Record<SupportedLocale, LegalDocLocale> = {
  'pt-BR': 'PT_BR',
  'en-US': 'EN_US',
  'es-ES': 'ES_ES',
  'it-IT': 'IT_IT',
};

const FALLBACK_LOCALE: LegalDocLocale = 'PT_BR';

/** Mapeia o locale da aplicacao para o enum de locale dos documentos legais. */
export function toLegalLocale(locale: SupportedLocale): LegalDocLocale {
  return LOCALE_MAP[locale] ?? FALLBACK_LOCALE;
}

/** Hash SHA-256 do IP do solicitante (privacidade; nunca persistir IP claro). */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

export interface ActiveDocPayload {
  id: string;
  type: LegalDocType;
  locale: LegalDocLocale;
  version: string;
  hash: string;
  title: string;
  content: string;
  /** Metadado de auditoria (required_since). NUNCA usado como criterio de bloqueio. */
  requiredSince: string;
  requiresAcceptance: boolean;
}

/**
 * Resolve o documento ACTIVE em vigor para um tipo, preferindo o locale do
 * usuario e caindo para PT_BR quando o tipo nao foi publicado naquele idioma.
 * Quando ha mais de um ACTIVE (transicao de versao), vence o `effectiveAt` mais
 * recente. Retorna `null` quando nao ha documento ativo (Gate libera children).
 */
export async function getActiveLegalDoc(
  type: LegalDocType,
  locale: LegalDocLocale,
): Promise<ActiveDocPayload | null> {
  const locales: LegalDocLocale[] =
    locale === FALLBACK_LOCALE ? [FALLBACK_LOCALE] : [locale, FALLBACK_LOCALE];

  for (const candidate of locales) {
    const doc = await prisma.legalDoc.findFirst({
      where: { type, locale: candidate, status: 'ACTIVE' },
      orderBy: { effectiveAt: 'desc' },
    });
    if (doc) {
      return {
        id: doc.id,
        type: doc.type as LegalDocType,
        locale: doc.locale as LegalDocLocale,
        version: doc.version,
        hash: doc.contentHashSha256,
        title: doc.title,
        content: doc.bodyMarkdown,
        requiredSince: doc.effectiveAt.toISOString(),
        requiresAcceptance: doc.requiresAcceptance,
      };
    }
  }

  return null;
}

export interface AcceptanceStatus {
  doc: ActiveDocPayload | null;
  /** True quando o Gate deve liberar `children` (sem doc, sem exigencia ou ja aceito). */
  satisfied: boolean;
  accepted: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
}

/**
 * Status de aceite do usuario para um tipo de documento. O bloqueio depende
 * EXCLUSIVAMENTE de existir uma linha de aceite para a `version` ativa.
 */
export async function getAcceptanceStatus(
  userId: string,
  type: LegalDocType,
  locale: LegalDocLocale,
): Promise<AcceptanceStatus> {
  const doc = await getActiveLegalDoc(type, locale);

  // Empty: sem documento ativo OU documento nao exige aceite -> libera.
  if (!doc || !doc.requiresAcceptance) {
    return { doc, satisfied: true, accepted: !doc, acceptedVersion: null, acceptedAt: null };
  }

  const acceptance = await prisma.termAcceptance.findUnique({
    where: { userId_type_version: { userId, type, version: doc.version } },
  });

  return {
    doc,
    satisfied: Boolean(acceptance),
    accepted: Boolean(acceptance),
    acceptedVersion: acceptance ? acceptance.version : null,
    acceptedAt: acceptance ? acceptance.acceptedAt.toISOString() : null,
  };
}

export interface RecordAcceptanceInput {
  userId: string;
  type: LegalDocType;
  locale: LegalDocLocale;
  version: string;
  ip?: string;
  userAgent?: string | null;
  source?: LegalAcceptanceSource;
}

export type RecordAcceptanceResult =
  | { ok: true; version: string; acceptedAt: string; idempotentHit: boolean }
  | { ok: false; reason: 'no_active_doc' | 'version_mismatch' };

/**
 * Registra o aceite de forma idempotente por (user, type, version).
 * Re-aceitar a mesma versao NAO duplica linha nem move `acceptedAt` (auditoria
 * preserva o primeiro aceite). Rejeita versao que nao corresponde a ativa para
 * impedir aceite de documento defasado.
 */
export async function recordAcceptance(
  input: RecordAcceptanceInput,
): Promise<RecordAcceptanceResult> {
  const type = legalDocTypeSchema.parse(input.type);
  const source = legalAcceptanceSourceSchema.parse(input.source ?? 'LOGIN_BLOCKER');

  const doc = await getActiveLegalDoc(type, input.locale);
  if (!doc) return { ok: false, reason: 'no_active_doc' };
  if (doc.version !== input.version) return { ok: false, reason: 'version_mismatch' };

  const ipHash = input.ip ? hashIp(input.ip) : undefined;
  const userAgent = input.userAgent ? input.userAgent.slice(0, 400) : undefined;

  const existing = await prisma.termAcceptance.findUnique({
    where: { userId_type_version: { userId: input.userId, type, version: doc.version } },
  });

  if (existing) {
    return {
      ok: true,
      version: existing.version,
      acceptedAt: existing.acceptedAt.toISOString(),
      idempotentHit: true,
    };
  }

  const created = await prisma.termAcceptance.create({
    data: {
      userId: input.userId,
      legalDocId: doc.id,
      type,
      version: doc.version,
      source,
      ipHash,
      userAgent,
    },
  });

  return {
    ok: true,
    version: created.version,
    acceptedAt: created.acceptedAt.toISOString(),
    idempotentHit: false,
  };
}
