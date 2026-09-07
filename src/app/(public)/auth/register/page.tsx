import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/lib/constants/routes';
import { RegisterForm } from '@/components/auth/register-form';
import { AuthPageWrapper } from '@/components/shared';
import {
  MONTHLY_OPTIONS,
  planSelectionFromParams,
  type LandingPlanId,
} from '@/lib/constants/landing';
import { logger } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'Criar Conta',
  description: 'Crie sua conta no Corgly e comece a aprender português hoje.',
  robots: { index: false, follow: false },
};

interface RegisterPageProps {
  /** Next 16: `searchParams` e Promise e precisa ser aguardado. */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Parametro repetido na URL (`?plan=A&plan=B`) vale pela primeira ocorrencia. */
function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Nome publicado de cada plano — mesma copy da vitrine, sem chave nova. */
const PLAN_NAME_KEYS: Record<LandingPlanId, string> = {
  SINGLE: 'packages.single.name',
  PACK_10: 'packages.pack10.name',
  MONTHLY: 'packages.monthly.name',
};

/**
 * Cadastro.
 *
 * Alem do formulario, esta pagina e o meio da ponte landing -> vitrine: o CTA de
 * plano da landing manda `?plan=` (e `?lessons=` no mensal) para ca. A pagina
 * confirma a escolha na tela — visitante que clicou em "Pacote 10 aulas"
 * precisa VER que a escolha nao se perdeu — e entrega a selecao ao formulario,
 * que a guarda para atravessar a confirmacao de e-mail.
 *
 * O aviso de plano usa next-intl (chaves `auth.register.*`) mesmo com o resto
 * da pagina ainda em pt-BR fixo: copy nova nasce traduzida; migrar o restante
 * do cadastro para next-intl e trabalho separado.
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const planSelection = planSelectionFromParams(
    firstValue(params.plan),
    firstValue(params.lessons),
  );

  const [tPricing, tRegister] = await Promise.all([
    getTranslations('landing.pricing'),
    getTranslations('auth.register'),
  ]);

  let planLabel: string | null = null;
  let noticeTitle: string | null = null;
  let noticeDesc: string | null = null;

  if (planSelection) {
    const planName = tPricing(PLAN_NAME_KEYS[planSelection.plan]);
    planLabel =
      planSelection.plan === 'MONTHLY'
        ? `${planName} · ${tPricing('monthly_option', {
            count: planSelection.monthlyLessons ?? MONTHLY_OPTIONS[0].lessons,
          })}`
        : planName;

    // Chave ausente NAO pode apagar o aviso nem imprimir a chave crua: cai no
    // nome do plano (que existe no dicionario da vitrine) e registra o defeito.
    const hasTitle = tRegister.has('planNoticeTitle');
    const hasDesc = tRegister.has('planNoticeDesc');
    if (!hasTitle || !hasDesc) {
      logger.error('[i18n] chave de traducao ausente', {
        action: 'i18n.missing_key',
        component: 'RegisterPage',
        messageKey: [!hasTitle && 'auth.register.planNoticeTitle', !hasDesc && 'auth.register.planNoticeDesc']
          .filter(Boolean)
          .join(', '),
      });
    }
    noticeTitle = hasTitle ? tRegister('planNoticeTitle', { plan: planLabel }) : planLabel;
    noticeDesc = hasDesc ? tRegister('planNoticeDesc') : null;
  }

  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-register" className="w-full max-w-[448px]">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div data-testid="auth-register-header" className="mb-6">
            <h1 className="text-2xl md:text-[26px] font-bold text-foreground">
              Criar Conta
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Junte-se ao Corgly e comece a aprender português
            </p>
          </div>

          {noticeTitle && (
            <div
              data-testid="auth-register-plan-notice"
              data-plan={planSelection?.plan}
              data-lessons={planSelection?.monthlyLessons}
              className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3"
            >
              <p className="text-sm font-medium text-foreground">{noticeTitle}</p>
              {noticeDesc && <p className="mt-1 text-xs text-muted-foreground">{noticeDesc}</p>}
            </div>
          )}

          <RegisterForm planSelection={planSelection} />
        </div>

        {/* Link to login */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Já tem uma conta?{' '}
          <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </AuthPageWrapper>
  );
}
