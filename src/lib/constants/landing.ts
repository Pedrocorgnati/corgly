import { ROUTES } from '@/lib/constants/routes';

export const LESSON_DURATION_MINUTES = 50;
export const FIRST_LESSON_USD = 12.5;
export const SINGLE_USD = 25;
export const PACK10_USD = 190;
export const PACK10_PER = 19;
export const MONTHLY_OPTIONS = [
  { lessons: 10, per: 17 },
  { lessons: 20, per: 15 },
] as const;
export type MonthlyLessons = (typeof MONTHLY_OPTIONS)[number]['lessons'];

export function monthlyTotalUsd(lessons: MonthlyLessons): number {
  const option = MONTHLY_OPTIONS.find((item) => item.lessons === lessons) ?? MONTHLY_OPTIONS[0];
  return option.lessons * option.per;
}

export function monthlyPerUsd(lessons: MonthlyLessons): number {
  const option = MONTHLY_OPTIONS.find((item) => item.lessons === lessons) ?? MONTHLY_OPTIONS[0];
  return option.per;
}

const FALLBACK_SITE_URL = 'https://corgly.app';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function resolveSiteUrl(
  rawInput = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || FALLBACK_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const raw = rawInput.replace(/\/$/, '');
  try {
    const hostname = new URL(raw).hostname;
    if (nodeEnv === 'production' && isLocalHost(hostname)) {
      return FALLBACK_SITE_URL;
    }
  } catch {
    if (nodeEnv === 'production') return FALLBACK_SITE_URL;
  }
  return raw;
}

export const SITE_URL = resolveSiteUrl();

// ─────────────────────────────────────────────────────────────────────────────
// Ponte landing -> vitrine: a escolha de plano do visitante
// ─────────────────────────────────────────────────────────────────────────────

/** Planos publicados na vitrine (landing e /credits). PACK_5 saiu da vitrine. */
export type LandingPlanId = 'SINGLE' | 'PACK_10' | 'MONTHLY';

const LANDING_PLAN_IDS: readonly LandingPlanId[] = ['SINGLE', 'PACK_10', 'MONTHLY'];

/**
 * Type guard interno. Nao e exportado de proposito: quem le `?plan=` (a pagina
 * de cadastro e a vitrine do dashboard) entra por `planSelectionFromParams`,
 * que valida plano E volume de uma vez. Duas portas de leitura para o mesmo
 * contrato de URL foi exatamente como a vitrine acabou com um parser proprio,
 * capaz de aceitar `?plan=SINGLE&lessons=20` — plano avulso com volume mensal.
 */
function isLandingPlanId(value: unknown): value is LandingPlanId {
  return typeof value === 'string' && (LANDING_PLAN_IDS as readonly string[]).includes(value);
}

/** `?lessons=` so aceita os volumes publicados (10 e 20). Interno, como acima. */
function parseMonthlyLessonsParam(raw: unknown): MonthlyLessons | null {
  const normalized =
    typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  const option = MONTHLY_OPTIONS.find((item) => String(item.lessons) === normalized);
  return option ? option.lessons : null;
}

/** Escolha feita na vitrine publica. `monthlyLessons` so existe no MONTHLY. */
export interface PlanSelection {
  plan: LandingPlanId;
  monthlyLessons?: MonthlyLessons;
}

/**
 * Query canonica que carrega a escolha entre rotas (`plan` + `lessons`).
 * Uma unica funcao monta e uma unica funcao le — nada de string solta por ai.
 */
export function planSelectionQuery(selection: PlanSelection): string {
  const params = new URLSearchParams({ plan: selection.plan });
  if (selection.plan === 'MONTHLY' && selection.monthlyLessons) {
    params.set('lessons', String(selection.monthlyLessons));
  }
  return params.toString();
}

/**
 * Le a escolha de um par de valores crus (query string OU registro guardado).
 * Plano desconhecido devolve `null`; volume invalido nao invalida o plano, so
 * cai no volume padrao da vitrine.
 */
export function planSelectionFromParams(plan: unknown, lessons?: unknown): PlanSelection | null {
  const normalized = typeof plan === 'string' ? plan.trim().toUpperCase() : null;
  if (!isLandingPlanId(normalized)) return null;
  if (normalized !== 'MONTHLY') return { plan: normalized };
  const monthlyLessons = parseMonthlyLessonsParam(lessons);
  return monthlyLessons ? { plan: normalized, monthlyLessons } : { plan: normalized };
}

/**
 * Onde a escolha do visitante espera o fim do cadastro.
 *
 * DECISAO EXPLICITA (Zero Fluxos Incompletos): o cadastro do Corgly NAO termina
 * no formulario. Ele desvia por confirmacao de e-mail — o link chega por e-mail
 * e costuma abrir OUTRA aba — e depois pelo login. Query string nao atravessa
 * esse desvio e `sessionStorage` morre na troca de aba, entao a escolha e
 * guardada em `localStorage` (mesmo navegador) com carimbo de tempo e validade
 * curta. Quem grava: o formulario de cadastro (`register-form.tsx`), assim que
 * a pagina abre com `?plan=`. Quem consome: a vitrine (`pricing-cards.tsx`),
 * UMA unica vez, apagando o registro em seguida. Se o aluno nunca chegar la, o
 * registro expira sozinho em `PLAN_SELECTION_TTL_MS`.
 */
const PLAN_SELECTION_STORAGE_KEY = 'corgly.planSelection';
export const PLAN_SELECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function savePlanSelection(selection: PlanSelection, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PLAN_SELECTION_STORAGE_KEY,
      JSON.stringify({ ...selection, savedAt: now }),
    );
  } catch {
    // Storage bloqueado (aba anonima, cota estourada): a escolha segue valendo
    // pela URL nesta navegacao e simplesmente nao sobrevive ao desvio de e-mail.
  }
}

export function clearPlanSelection(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PLAN_SELECTION_STORAGE_KEY);
  } catch {
    // Mesmo caso do save: sem storage nao ha o que limpar.
  }
}

export function readPlanSelection(now: number = Date.now()): PlanSelection | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PLAN_SELECTION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let record: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      clearPlanSelection();
      return null;
    }
    record = parsed as Record<string, unknown>;
  } catch {
    // Registro corrompido nao pode preselecionar plano nenhum.
    clearPlanSelection();
    return null;
  }

  const savedAt = typeof record.savedAt === 'number' ? record.savedAt : 0;
  if (savedAt <= 0 || now - savedAt > PLAN_SELECTION_TTL_MS) {
    clearPlanSelection();
    return null;
  }

  const selection = planSelectionFromParams(record.plan, record.monthlyLessons);
  if (!selection) clearPlanSelection();
  return selection;
}

/**
 * Destino do CTA de um plano da vitrine publica.
 *
 * Autenticado vai direto para a vitrine do dashboard com o plano escolhido.
 * Visitante vai para o cadastro LEVANDO a escolha junto (`plan` e `lessons`):
 * antes todo mundo caia em `/auth/register?intent=first-lesson` e o plano — em
 * especial o volume mensal — morria ali. O `intent` ja existente continua sendo
 * emitido para nao quebrar quem o leia.
 *
 * Este href e apenas o PRIMEIRO elo. A travessia da confirmacao de e-mail e do
 * login e feita pelo registro persistido (`savePlanSelection`), porque URL
 * nenhuma sobrevive a um link aberto de dentro do e-mail.
 */
export function planHref(
  isAuthenticated: boolean,
  plan: LandingPlanId,
  monthlyLessons?: MonthlyLessons,
): string {
  const query = planSelectionQuery({ plan, monthlyLessons });
  if (isAuthenticated) {
    return `${ROUTES.CREDITS}?${query}`;
  }
  return `${ROUTES.REGISTER}?intent=first-lesson&${query}`;
}

/**
 * Destino do CTA de "primeira aula" (hero e CTA final da landing).
 *
 * A primeira aula promocional E uma aula avulsa: o plano vendido ali e o
 * `SINGLE`. Por isso este href e apenas `planHref(isAuthenticated, 'SINGLE')` —
 * antes ele montava a query a mao nos dois ramos e o visitante caia em
 * `/auth/register?intent=first-lesson` SEM plano nenhum, perdendo a escolha
 * logo no primeiro clique da landing. Delegando, os dois CTAs passam a usar a
 * mesma montagem canonica (`planSelectionQuery`) e nao ha formato de query
 * duplicado para sair de sincronia.
 */
export function firstLessonHref(isAuthenticated: boolean): string {
  return planHref(isAuthenticated, 'SINGLE');
}

export function formatUsd(amount: number, locale: string): string {
  const isEn = locale.startsWith('en');
  if (Number.isInteger(amount)) {
    return `US$ ${amount}`;
  }
  if (isEn) {
    return `US$ ${amount.toFixed(2)}`;
  }
  return `US$ ${amount.toFixed(2).replace('.', ',')}`;
}
