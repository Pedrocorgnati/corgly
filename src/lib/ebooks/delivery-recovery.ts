import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EbookOrder, PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  EBOOK_DELIVERY_LEASE_MS,
  fulfillEbookCheckoutSession,
  reconcileEbookDeliveryStatus,
  type EbookFulfillmentStatus,
} from './fulfillment';

// Recuperacao de entrega (A1): reconcile (dry-run, gera manifesto), recover
// (reentrega pelo fulfillment idempotente) e CLI. Nenhum envio direto de email.
// Imports com env (stripe, prisma, fulfillment-ports, evidence-export) so via
// import() dinamico dentro do subcomando, para --help e validacao de flags
// rodarem sem env.

/** Maximo de ids aprovados por run do recover. */
export const EBOOK_RECOVERY_MAX_APPROVE_COUNT = 25;
/** Tamanho do lote: Promise.all dentro do lote, lotes em sequencia. */
export const EBOOK_RECOVERY_BATCH_SIZE = 5;
/** Taxa de erro acumulada acima da qual o breaker interrompe o run. */
export const EBOOK_RECOVERY_ERROR_RATE_LIMIT = 0.1;
export const EBOOK_RECOVERY_CIRCUIT_BREAKER_REVISION = 'g6-v1';
/** Janela maxima do reconcile, em dias. */
export const EBOOK_RECOVERY_MAX_WINDOW_DAYS = 90;
export const EBOOK_RECOVERY_MANIFEST_SCHEMA_VERSION = 1;

/** Select unico: leitura do reconcile e releitura TOCTOU do recover. */
export const EBOOK_RECOVERY_ORDER_SELECT = {
  id: true,
  checkoutSessionId: true,
  paymentStatus: true,
  deliveryStatus: true,
  deliveryClaimedAt: true,
} as const;

export type EbookRecoveryErrorCode =
  | 'EBOOK_RECOVERY_INVALID_INPUT'
  | 'EBOOK_RECOVERY_OUTPUT_REJECTED'
  | 'EBOOK_RECOVERY_SHA_MISMATCH'
  | 'EBOOK_RECOVERY_MANIFEST_INVALID'
  | 'EBOOK_RECOVERY_MANIFEST_NOT_CANONICAL'
  | 'EBOOK_RECOVERY_APPROVAL_INVALID'
  | 'EBOOK_RECOVERY_REVISION_MISMATCH';

/** Falha de validacao ou de saida da recuperacao de entrega. */
export class EbookRecoveryError extends AppError {
  constructor(code: EbookRecoveryErrorCode, message: string) {
    super(code, message, 500);
    this.name = 'EbookRecoveryError';
  }
}

export type EbookRecoverySession = {
  id: string;
  status: string | null;
  payment_status: string;
  metadata: Record<string, string> | null;
};

/** Unica porta nova: so a listagem de Checkout Sessions. */
export type EbookRecoveryStripe = {
  checkout: {
    sessions: {
      list(params: {
        created: { gte: number; lt: number };
        limit: number;
        starting_after?: string;
      }): Promise<{ data: EbookRecoverySession[]; has_more: boolean }>;
    };
  };
};

export type EbookRecoveryClassification =
  | 'affected'
  | 'reconcile_status'
  | 'manual_review'
  | 'excluded';

export type EbookRecoveryEntry = {
  checkoutSessionId: string;
  orderId: string | null;
  classification: EbookRecoveryClassification;
  reason: string | null;
};

export type EbookRecoveryOrderSnapshot = Pick<
  EbookOrder,
  'id' | 'checkoutSessionId' | 'paymentStatus' | 'deliveryStatus' | 'deliveryClaimedAt'
>;

export type EbookRecoveryPrisma = Pick<PrismaClient, 'ebookOrder'>;

export type EbookRecoveryManifest = {
  schemaVersion: 1;
  window: { from: string; to: string; timezone: string };
  generatedAt: string;
  circuitBreakerRevision: string;
  entries: EbookRecoveryEntry[];
};

export type EbookRecoveryResultKind =
  | 'delivered'
  | 'accepted'
  | 'in_progress'
  | 'skipped'
  | 'needs_review'
  | 'error';

export type EbookRecoveryResult = {
  checkoutSessionId: string;
  result: EbookRecoveryResultKind;
  reason: string | null;
};

export type EbookRecoveryCliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

const CLASSIFICATIONS: readonly EbookRecoveryClassification[] = [
  'affected',
  'reconcile_status',
  'manual_review',
  'excluded',
];

const RESULT_KINDS: readonly EbookRecoveryResultKind[] = [
  'delivered',
  'accepted',
  'in_progress',
  'skipped',
  'needs_review',
  'error',
];

function fail(code: EbookRecoveryErrorCode, message: string): never {
  throw new EbookRecoveryError(code, message);
}

function utcCompact(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '');
}

// ---------------------------------------------------------------------------
// Listagem e classificacao
// ---------------------------------------------------------------------------

/**
 * Lista as sessions pagas com marcador de ebook na janela [from, to).
 * Paginacao por starting_after; o filtro de metadata e local (o Stripe nao
 * filtra por metadata na listagem). Erro do Stripe propaga: nada parcial.
 */
export async function listPaidEbookSessions(
  stripe: EbookRecoveryStripe,
  window: { from: Date; to: Date },
): Promise<{ scanned: number; sessions: EbookRecoverySession[] }> {
  // created do Stripe e inteiro em segundos: s entra em [from, to) se e so se
  // ceil(from) <= s < ceil(to). Com floor, um from fracionario incluiria o
  // segundo anterior a ele.
  const gte = Math.ceil(window.from.getTime() / 1000);
  const lt = Math.ceil(window.to.getTime() / 1000);
  const sessions: EbookRecoverySession[] = [];
  let scanned = 0;
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      created: { gte, lt },
      limit: 100,
      ...(startingAfter !== undefined ? { starting_after: startingAfter } : {}),
    });
    scanned += page.data.length;
    for (const session of page.data) {
      if (
        session.status === 'complete' &&
        session.payment_status === 'paid' &&
        session.metadata?.kind === 'ebook'
      ) {
        sessions.push(session);
      }
    }
    const last = page.data[page.data.length - 1];
    // Pagina vazia com has_more true: parar, para nao entrar em loop.
    if (!page.has_more || last === undefined) break;
    startingAfter = last.id;
  }

  return { scanned, sessions };
}

/** Classificacao pura (tabela D4): a primeira regra que casa vence. */
export function classifyEbookRecoveryCandidate(
  session: Pick<EbookRecoverySession, 'id'>,
  order: EbookRecoveryOrderSnapshot | null,
  now: Date,
): { classification: EbookRecoveryClassification; reason: string | null } {
  void session;
  if (order === null) return { classification: 'affected', reason: null };
  if (order.paymentStatus !== 'PAID') {
    return { classification: 'excluded', reason: `payment_${order.paymentStatus}` };
  }
  switch (order.deliveryStatus) {
    case 'PENDING':
      return { classification: 'affected', reason: null };
    case 'CLAIMED':
    case 'SENDING': {
      if (order.deliveryClaimedAt === null) {
        return { classification: 'manual_review', reason: 'claimed_without_timestamp' };
      }
      if (order.deliveryClaimedAt.getTime() + EBOOK_DELIVERY_LEASE_MS <= now.getTime()) {
        return { classification: 'affected', reason: null };
      }
      return { classification: 'excluded', reason: 'in_progress' };
    }
    case 'ACCEPTED':
      return { classification: 'reconcile_status', reason: null };
    case 'DELIVERED':
      return { classification: 'excluded', reason: 'delivered' };
    case 'NEEDS_REVIEW':
      return { classification: 'manual_review', reason: 'needs_review' };
    default: {
      const unreachable: never = order.deliveryStatus;
      return unreachable;
    }
  }
}

// ---------------------------------------------------------------------------
// Manifesto canonico
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeysDeep(source[key]);
    return sorted;
  }
  return value;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Serializacao canonica: chaves e entries ordenadas, indent 2, newline final. */
export function serializeEbookRecoveryManifest(manifest: EbookRecoveryManifest): string {
  const entries = [...manifest.entries]
    .sort((a, b) => compareIds(a.checkoutSessionId, b.checkoutSessionId))
    .map((entry) => ({
      checkoutSessionId: entry.checkoutSessionId,
      orderId: entry.orderId,
      classification: entry.classification,
      reason: entry.reason,
    }));
  return JSON.stringify(sortKeysDeep({ ...manifest, entries }), null, 2) + '\n';
}

/** sha256 hex dos bytes UTF-8 exatos do manifesto. */
export function hashManifest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Grava com wx fora de qualquer repo git; nunca sobrescreve. */
function writeNewFileOutsideRepo(target: string, content: string): string {
  const resolved = path.resolve(target);
  const dir = path.dirname(resolved);
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    return fail('EBOOK_RECOVERY_OUTPUT_REJECTED', 'diretorio de destino inexistente');
  }
  for (let current = realDir; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return fail(
        'EBOOK_RECOVERY_OUTPUT_REJECTED',
        'destino dentro de um repositorio git e recusado',
      );
    }
    if (path.dirname(current) === current) break;
  }
  try {
    fs.writeFileSync(resolved, content, { flag: 'wx', encoding: 'utf8' });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return fail(
      'EBOOK_RECOVERY_OUTPUT_REJECTED',
      code === 'EEXIST' ? 'arquivo de destino ja existe' : 'falha ao gravar o destino',
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

// ISO 8601 estrito: data pura (UTC pela especificacao) ou datetime com Z ou
// offset explicito. Datetime sem zona e recusado, porque Date.parse o leria no
// fuso da maquina e a janela mudaria conforme quem roda.
const ISO_UTC_INPUT =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function parseIsoUtc(value: string): number {
  const match = ISO_UTC_INPUT.exec(value);
  if (!match) return Number.NaN;
  const [, year, month, day] = match;
  // Recusa dia inexistente (2026-02-30), que Date.parse normalizaria em silencio.
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() !== Number(month) - 1 ||
    calendar.getUTCDate() !== Number(day)
  ) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function validateWindow(input: { from: string; to: string; timezone: string }): {
  from: Date;
  to: Date;
} {
  const fromMs = parseIsoUtc(input.from);
  const toMs = parseIsoUtc(input.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return fail(
      'EBOOK_RECOVERY_INVALID_INPUT',
      '--from e --to precisam ser ISO 8601 em UTC (data pura, ou datetime com Z ou offset)',
    );
  }
  if (fromMs >= toMs) {
    return fail('EBOOK_RECOVERY_INVALID_INPUT', '--from precisa ser anterior a --to');
  }
  if (toMs - fromMs > EBOOK_RECOVERY_MAX_WINDOW_DAYS * 86_400_000) {
    return fail(
      'EBOOK_RECOVERY_INVALID_INPUT',
      `janela acima de ${EBOOK_RECOVERY_MAX_WINDOW_DAYS} dias`,
    );
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
  } catch {
    return fail('EBOOK_RECOVERY_INVALID_INPUT', '--timezone precisa ser um nome IANA valido');
  }
  return { from: new Date(fromMs), to: new Date(toMs) };
}

/** Reconcile: lista, classifica e grava o manifesto. Sempre dry-run. */
export async function reconcileEbookDeliveries(
  input: { from: string; to: string; timezone: string; out?: string },
  deps: { stripe: EbookRecoveryStripe; prisma: EbookRecoveryPrisma; now?: () => Date },
): Promise<{
  path: string;
  sha256: string;
  scanned: number;
  counts: Record<EbookRecoveryClassification, number>;
}> {
  const window = validateWindow(input);
  const now = (deps.now ?? (() => new Date()))();

  const { scanned, sessions } = await listPaidEbookSessions(deps.stripe, window);
  const ids = [...new Set(sessions.map((s) => s.id))];
  const orders =
    ids.length === 0
      ? []
      : await deps.prisma.ebookOrder.findMany({
          where: { checkoutSessionId: { in: ids } },
          select: EBOOK_RECOVERY_ORDER_SELECT,
        });
  const byCheckout = new Map(orders.map((order) => [order.checkoutSessionId, order]));

  const counts: Record<EbookRecoveryClassification, number> = {
    affected: 0,
    reconcile_status: 0,
    manual_review: 0,
    excluded: 0,
  };
  const entries: EbookRecoveryEntry[] = ids.map((id) => {
    const order = byCheckout.get(id) ?? null;
    const { classification, reason } = classifyEbookRecoveryCandidate({ id }, order, now);
    counts[classification] += 1;
    return { checkoutSessionId: id, orderId: order?.id ?? null, classification, reason };
  });

  const content = serializeEbookRecoveryManifest({
    schemaVersion: EBOOK_RECOVERY_MANIFEST_SCHEMA_VERSION,
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      timezone: input.timezone,
    },
    generatedAt: now.toISOString(),
    circuitBreakerRevision: EBOOK_RECOVERY_CIRCUIT_BREAKER_REVISION,
    entries,
  });
  const sha256 = hashManifest(content);
  const target =
    input.out ??
    path.join(os.tmpdir(), `ebooks-recovery-${utcCompact(now)}-${sha256.slice(0, 12)}.json`);
  const written = writeNewFileOutsideRepo(target, content);
  return { path: written, sha256, scanned, counts };
}

// ---------------------------------------------------------------------------
// Recover
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, i) => key === [...keys].sort()[i]);
}

function parseManifest(content: string): EbookRecoveryManifest {
  const invalid = (detail: string): never =>
    fail('EBOOK_RECOVERY_MANIFEST_INVALID', `manifesto invalido: ${detail}`);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return invalid('JSON malformado');
  }
  if (!isRecord(raw)) return invalid('raiz nao e objeto');
  if (raw.schemaVersion !== EBOOK_RECOVERY_MANIFEST_SCHEMA_VERSION) {
    return invalid('schemaVersion');
  }
  const window = raw.window;
  if (
    !isRecord(window) ||
    typeof window.from !== 'string' ||
    typeof window.to !== 'string' ||
    typeof window.timezone !== 'string'
  ) {
    return invalid('window');
  }
  if (typeof raw.generatedAt !== 'string') return invalid('generatedAt');
  if (typeof raw.circuitBreakerRevision !== 'string') return invalid('circuitBreakerRevision');
  if (!Array.isArray(raw.entries)) return invalid('entries');

  const seen = new Set<string>();
  const entries: EbookRecoveryEntry[] = [];
  for (const item of raw.entries as unknown[]) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['checkoutSessionId', 'orderId', 'classification', 'reason'])
    ) {
      return invalid('entry');
    }
    const { checkoutSessionId, orderId, classification, reason } = item;
    if (typeof checkoutSessionId !== 'string' || checkoutSessionId === '') {
      return invalid('checkoutSessionId');
    }
    if (orderId !== null && typeof orderId !== 'string') return invalid('orderId');
    if (!CLASSIFICATIONS.includes(classification as EbookRecoveryClassification)) {
      return invalid('classification');
    }
    if (reason !== null && typeof reason !== 'string') return invalid('reason');
    if (seen.has(checkoutSessionId)) return invalid('checkoutSessionId repetido');
    seen.add(checkoutSessionId);
    entries.push({
      checkoutSessionId,
      orderId,
      classification: classification as EbookRecoveryClassification,
      reason,
    });
  }
  return {
    schemaVersion: 1,
    window: { from: window.from, to: window.to, timezone: window.timezone },
    generatedAt: raw.generatedAt,
    circuitBreakerRevision: raw.circuitBreakerRevision,
    entries,
  };
}

function mapFulfillmentStatus(status: EbookFulfillmentStatus): {
  result: EbookRecoveryResultKind;
  reason: string | null;
} {
  switch (status) {
    case 'delivered':
    case 'accepted':
    case 'in_progress':
    case 'needs_review':
      return { result: status, reason: null };
    case 'not_ebook':
    case 'pending_payment':
    case 'failed_payment':
    case 'revoked':
      return { result: 'skipped', reason: status };
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function emptyResultCounts(): Record<EbookRecoveryResultKind, number> {
  return { delivered: 0, accepted: 0, in_progress: 0, skipped: 0, needs_review: 0, error: 0 };
}

/**
 * Recover: valida tudo antes de qualquer leitura de banco; sem execute so
 * devolve o plano. Com execute reentrega pelo fulfillment idempotente.
 */
export async function recoverEbookDeliveries(
  input: {
    manifestPath: string;
    sha256: string;
    approveCount: number;
    allowlist: string[];
    circuitBreakerRevision: string;
    execute: boolean;
  },
  deps: {
    prisma: EbookRecoveryPrisma;
    now?: () => Date;
    onResult?: (result: EbookRecoveryResult) => void;
  },
): Promise<{
  mode: 'plan' | 'execute';
  plan: Array<{ checkoutSessionId: string; action: 'fulfill' | 'reconcile_status' }>;
  results: EbookRecoveryResult[];
  counts: Record<EbookRecoveryResultKind, number>;
  breakerOpen: boolean;
}> {
  let content: string;
  try {
    content = fs.readFileSync(input.manifestPath, 'utf8');
  } catch {
    return fail('EBOOK_RECOVERY_MANIFEST_INVALID', 'manifesto ilegivel ou inexistente');
  }
  if (hashManifest(content) !== input.sha256.toLowerCase()) {
    fail('EBOOK_RECOVERY_SHA_MISMATCH', 'sha256 informado diverge do manifesto');
  }
  const manifest = parseManifest(content);
  if (serializeEbookRecoveryManifest(manifest) !== content) {
    fail('EBOOK_RECOVERY_MANIFEST_NOT_CANONICAL', 'manifesto nao esta na forma canonica');
  }

  const { approveCount, allowlist } = input;
  if (
    !Number.isInteger(approveCount) ||
    approveCount < 1 ||
    approveCount > EBOOK_RECOVERY_MAX_APPROVE_COUNT
  ) {
    fail(
      'EBOOK_RECOVERY_APPROVAL_INVALID',
      `--approve-count precisa estar entre 1 e ${EBOOK_RECOVERY_MAX_APPROVE_COUNT}`,
    );
  }
  if (allowlist.length !== approveCount) {
    fail('EBOOK_RECOVERY_APPROVAL_INVALID', 'tamanho da allowlist diverge de --approve-count');
  }
  if (new Set(allowlist).size !== allowlist.length) {
    fail('EBOOK_RECOVERY_APPROVAL_INVALID', 'allowlist com id repetido');
  }
  const byId = new Map(manifest.entries.map((entry) => [entry.checkoutSessionId, entry]));
  for (const id of allowlist) {
    const entry = byId.get(id);
    if (
      entry === undefined ||
      (entry.classification !== 'affected' && entry.classification !== 'reconcile_status')
    ) {
      fail(
        'EBOOK_RECOVERY_APPROVAL_INVALID',
        `id fora do manifesto ou nao elegivel: ${id}`,
      );
    }
  }
  if (
    input.circuitBreakerRevision !== manifest.circuitBreakerRevision ||
    input.circuitBreakerRevision !== EBOOK_RECOVERY_CIRCUIT_BREAKER_REVISION
  ) {
    fail('EBOOK_RECOVERY_REVISION_MISMATCH', 'revisao do breaker diverge do manifesto');
  }

  const allowed = new Set(allowlist);
  const selected = manifest.entries.filter((entry) => allowed.has(entry.checkoutSessionId));
  const plan = selected.map((entry) => ({
    checkoutSessionId: entry.checkoutSessionId,
    action: entry.classification === 'affected' ? ('fulfill' as const) : ('reconcile_status' as const),
  }));

  const counts = emptyResultCounts();
  if (!input.execute) {
    return { mode: 'plan', plan, results: [], counts, breakerOpen: false };
  }

  const now = deps.now ?? (() => new Date());
  const { buildDefaultEbookFulfillmentDeps } = await import('./fulfillment-ports');
  const fulfillmentDeps = buildDefaultEbookFulfillmentDeps();

  const recoverOne = async (entry: EbookRecoveryEntry): Promise<EbookRecoveryResult> => {
    const checkoutSessionId = entry.checkoutSessionId;
    try {
      const fresh = await deps.prisma.ebookOrder.findUnique({
        where: { checkoutSessionId },
        select: EBOOK_RECOVERY_ORDER_SELECT,
      });
      if (fresh === null && entry.orderId !== null) {
        return { checkoutSessionId, result: 'skipped', reason: 'order_missing' };
      }
      const { classification, reason } = classifyEbookRecoveryCandidate(
        { id: checkoutSessionId },
        fresh,
        now(),
      );
      if (classification === 'affected') {
        const outcome = await fulfillEbookCheckoutSession(
          { checkoutSessionId, trigger: 'recovery' },
          fulfillmentDeps,
        );
        return { checkoutSessionId, ...mapFulfillmentStatus(outcome.status) };
      }
      if (classification === 'reconcile_status' && fresh !== null) {
        const outcome = await reconcileEbookDeliveryStatus({ orderId: fresh.id }, fulfillmentDeps);
        return { checkoutSessionId, ...mapFulfillmentStatus(outcome.status) };
      }
      return { checkoutSessionId, result: 'skipped', reason };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'UNEXPECTED_ERROR';
      logger.warn('[ebooks-recovery] falha ao recuperar entrega', { checkoutSessionId, code });
      return { checkoutSessionId, result: 'error', reason: code };
    }
  };

  const results: EbookRecoveryResult[] = [];
  let processed = 0;
  let errors = 0;
  let breakerOpen = false;
  for (let i = 0; i < selected.length; i += EBOOK_RECOVERY_BATCH_SIZE) {
    const batch = selected.slice(i, i + EBOOK_RECOVERY_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(recoverOne));
    for (const result of batchResults) {
      results.push(result);
      counts[result.result] += 1;
      processed += 1;
      if (result.result === 'error') errors += 1;
      deps.onResult?.(result);
    }
    if (errors / processed > EBOOK_RECOVERY_ERROR_RATE_LIMIT) {
      breakerOpen = true;
      break;
    }
  }
  return { mode: 'execute', plan, results, counts, breakerOpen };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = [
  'uso: ebooks-delivery-recovery <subcomando> [flags]',
  '  reconcile --from <ISO> --to <ISO> --timezone <IANA> [--out <path>]',
  '  recover --manifest <path> --sha256 <hash> --approve-count <n> --allowlist <id,id,...>',
  '          --circuit-breaker-revision <rev> [--execute]',
  '  evidence --order <orderId> [--out <path>]',
  '  --help  mostra este uso',
];

type ParsedFlags = Map<string, string | true>;

/** Parser estrito: flag desconhecida, repetida, sem valor ou posicional = erro. */
function parseFlags(
  args: string[],
  valueFlags: string[],
  booleanFlags: string[],
): ParsedFlags | string {
  const parsed: ParsedFlags = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (!arg.startsWith('--')) return `argumento inesperado: ${arg}`;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (parsed.has(name)) return `flag repetida: ${name}`;
    if (booleanFlags.includes(name)) {
      if (eq !== -1) return `${name} nao aceita valor`;
      parsed.set(name, true);
    } else if (valueFlags.includes(name)) {
      let value: string | undefined;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        value = args[i + 1];
        i += 1;
      }
      if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) {
        return `valor ausente para ${name}`;
      }
      parsed.set(name, value);
    } else {
      return `flag desconhecida: ${name}`;
    }
  }
  return parsed;
}

function flagValue(flags: ParsedFlags, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function describeError(err: unknown): string {
  if (err instanceof AppError) return `erro: ${err.code}: ${err.message}`;
  const name = err instanceof Error ? err.name : 'UNEXPECTED_ERROR';
  return `erro: falha inesperada (${name})`;
}

/** Entrypoint da CLI: toda saida via io; retorna o exit code. */
export async function runEbooksDeliveryRecoveryCli(
  argv: string[],
  io: EbookRecoveryCliIo,
): Promise<number> {
  const usageError = (message: string): number => {
    io.stderr(message);
    for (const line of USAGE) io.stderr(line);
    return 1;
  };
  const printUsage = (): number => {
    for (const line of USAGE) io.stdout(line);
    return 0;
  };

  const [sub, ...rest] = argv;
  if (sub === undefined) return usageError('subcomando obrigatorio');
  if (sub === '--help' || sub === '-h') return printUsage();
  if (sub !== 'reconcile' && sub !== 'recover' && sub !== 'evidence') {
    return usageError(`subcomando desconhecido: ${sub}`);
  }
  if (rest.includes('--help') || rest.includes('-h')) return printUsage();

  try {
    if (sub === 'reconcile') {
      const flags = parseFlags(rest, ['--from', '--to', '--timezone', '--out'], ['--execute']);
      if (typeof flags === 'string') return usageError(flags);
      if (flags.has('--execute')) {
        return usageError('reconcile e sempre dry-run; --execute nao e aceito');
      }
      const from = flagValue(flags, '--from');
      const to = flagValue(flags, '--to');
      const timezone = flagValue(flags, '--timezone');
      if (from === undefined || to === undefined || timezone === undefined) {
        return usageError('--from, --to e --timezone sao obrigatorios');
      }
      const out = flagValue(flags, '--out');
      validateWindow({ from, to, timezone });

      const { getStripe } = await import('@/lib/stripe');
      const { prisma } = await import('@/lib/prisma');
      // Cast documentado: so os campos lidos pela listagem fazem parte da porta.
      const stripe: EbookRecoveryStripe = {
        checkout: {
          sessions: {
            list: (params) =>
              getStripe().checkout.sessions.list(params) as unknown as Promise<{
                data: EbookRecoverySession[];
                has_more: boolean;
              }>,
          },
        },
      };
      const report = await reconcileEbookDeliveries(
        { from, to, timezone, ...(out !== undefined ? { out } : {}) },
        { stripe, prisma },
      );
      io.stdout(`manifest=${report.path}`);
      io.stdout(`sha256=${report.sha256}`);
      io.stdout(`scanned=${report.scanned}`);
      for (const classification of CLASSIFICATIONS) {
        io.stdout(`${classification}=${report.counts[classification]}`);
      }
      return 0;
    }

    if (sub === 'recover') {
      const flags = parseFlags(
        rest,
        ['--manifest', '--sha256', '--approve-count', '--allowlist', '--circuit-breaker-revision'],
        ['--execute'],
      );
      if (typeof flags === 'string') return usageError(flags);
      const manifestPath = flagValue(flags, '--manifest');
      const sha256 = flagValue(flags, '--sha256');
      const approveRaw = flagValue(flags, '--approve-count');
      const allowRaw = flagValue(flags, '--allowlist');
      const revision = flagValue(flags, '--circuit-breaker-revision');
      if (
        manifestPath === undefined ||
        sha256 === undefined ||
        approveRaw === undefined ||
        allowRaw === undefined ||
        revision === undefined
      ) {
        return usageError(
          '--manifest, --sha256, --approve-count, --allowlist e --circuit-breaker-revision sao obrigatorios',
        );
      }
      if (!/^\d+$/.test(approveRaw)) return usageError('--approve-count precisa ser inteiro');
      const allowlist = allowRaw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== '');
      const execute = flags.has('--execute');
      const { prisma } = await import('@/lib/prisma');
      const report = await recoverEbookDeliveries(
        {
          manifestPath,
          sha256,
          approveCount: Number(approveRaw),
          allowlist,
          circuitBreakerRevision: revision,
          execute,
        },
        {
          prisma,
          onResult: (result) =>
            io.stdout(
              `result ${result.checkoutSessionId} ${result.result}` +
                (result.reason !== null ? ` reason=${result.reason}` : ''),
            ),
        },
      );
      if (report.mode === 'plan') {
        for (const item of report.plan) io.stdout(`plan ${item.checkoutSessionId} ${item.action}`);
        io.stdout(`mode=plan approved=${report.plan.length}`);
        return 0;
      }
      io.stdout(RESULT_KINDS.filter((kind) => kind !== 'error').map((kind) => `${kind}=${report.counts[kind]}`).concat(`error=${report.counts.error}`).join(' '));
      if (report.breakerOpen) {
        io.stderr('breaker=open: taxa de erro acima de 10%, lotes restantes interrompidos');
        return 1;
      }
      return report.counts.error > 0 ? 1 : 0;
    }

    const flags = parseFlags(rest, ['--order', '--out'], []);
    if (typeof flags === 'string') return usageError(flags);
    const orderId = flagValue(flags, '--order');
    if (orderId === undefined) return usageError('--order e obrigatorio');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return usageError('--order invalido');
    const out = flagValue(flags, '--out');
    const { buildEbookOrderEvidence } = await import('./evidence-export');
    const { prisma } = await import('@/lib/prisma');
    const evidence = await buildEbookOrderEvidence({ orderId }, { prisma });
    const target =
      out ?? path.join(os.tmpdir(), `ebooks-evidence-${orderId}-${utcCompact(new Date())}.json`);
    const written = writeNewFileOutsideRepo(target, evidence.json);
    io.stdout(`evidence=${written}`);
    io.stdout(`bytes=${evidence.bytes}`);
    return 0;
  } catch (err) {
    io.stderr(describeError(err));
    return 1;
  }
}
