import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PricingCards } from '@/components/student/pricing-cards';
import {
  CreditBalanceSummary,
  type CreditBalanceState,
} from '@/components/student/credit-balance-summary';
import { DiscountBanner } from '@/components/student/discount-banner';
import { PaymentCanceledBanner } from '@/components/student/payment-canceled-banner';
import { CreditExpiryAlert } from '@/components/credits/credit-expiry-alert';
import { getSession } from '@/lib/auth/session';
import { creditService } from '@/services/credit.service';
import { logger } from '@/lib/logger';
import { PageWrapper } from '@/components/shared';
import { planSelectionFromParams } from '@/lib/constants/landing';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits.page');
  return { title: t('title') };
}

interface CreditsPageProps {
  searchParams: Promise<{ canceled?: string; plan?: string; lessons?: string }>;
}

/** Prop de `CreditExpiryAlert`: lote com data de expiracao conhecida. */
interface ExpiringBatch {
  expiresAt: string;
  totalCredits: number;
  usedCredits: number;
}

/**
 * Saldo + lotes ativos do aluno, numa unica leitura com estado explicito.
 *
 * FONTE: `creditService.getBalance` e `creditService.getBreakdown`. Os dois
 * filtram pelo MESMO predicado que a consulta FEFO de autorizacao de
 * agendamento (`usedCredits < totalCredits AND (expiresAt > NOW() OR expiresAt
 * IS NULL)`), entao o numero exibido aqui e o numero que o backend aceita
 * gastar — nao ha dois saldos para divergir.
 *
 * Falha de banco NAO derruba a vitrine de planos (comprar continua possivel),
 * mas tambem NAO vira zero silencioso: o estado `error` chega ate a tela, que
 * mostra o aviso e um botao que refaz a busca. Um catch que devolvia lista
 * vazia dizia ao aluno sem credito nenhum que estava tudo certo.
 */
async function loadCreditSummary(
  userId: string,
): Promise<{ balance: CreditBalanceState; expiringBatches: ExpiringBatch[] }> {
  try {
    const [balance, breakdown] = await Promise.all([
      creditService.getBalance(userId),
      creditService.getBreakdown(userId),
    ]);
    return {
      balance: { status: 'ok', balance },
      expiringBatches: breakdown
        .filter((batch): batch is typeof batch & { expiresAt: string } => batch.expiresAt !== null)
        .map((batch) => ({
          expiresAt: batch.expiresAt,
          totalCredits: batch.totalCredits,
          usedCredits: batch.usedCredits,
        })),
    };
  } catch (error) {
    logger.error(
      'Falha ao carregar saldo e lotes de credito da vitrine',
      { action: 'credits.page.credit_summary', userId },
      error,
    );
    return { balance: { status: 'error' }, expiringBatches: [] };
  }
}

export default async function CreditsPage({ searchParams }: CreditsPageProps) {
  const params = await searchParams;
  const showCancelBanner = params.canceled === 'true';

  /**
   * `?plan=` e `?lessons=` vem da landing (`planHref`) e do login que recupera a
   * escolha guardada. Quem le e a MESMA funcao que a pagina de cadastro usa
   * (`planSelectionFromParams`): plano desconhecido devolve `null` e a vitrine
   * abre no estado padrao, e `lessons` so sobrevive no plano mensal.
   */
  const selection = planSelectionFromParams(params.plan, params.lessons);

  const [session, t] = await Promise.all([
    getSession(),
    getTranslations('credits.page'),
  ]);
  const isFirstPurchase = session?.user?.isFirstPurchase ?? false;
  const { balance, expiringBatches } = session
    ? await loadCreditSummary(session.user.id)
    : { balance: { status: 'error' } as CreditBalanceState, expiringBatches: [] };

  return (
    <PageWrapper data-testid="page-credits" className="max-w-6xl">
      <div data-testid="credits-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <PaymentCanceledBanner visible={showCancelBanner} />

      {/* Saldo antes da vitrine: o aluno decide o que comprar sabendo o que
          ainda tem. Estados de vazio e de erro vivem dentro do componente. */}
      <CreditBalanceSummary state={balance} />

      {/* Aviso de expiracao: o aluno chega aqui exatamente para resolver isso.
          O componente decide sozinho se ha lote dentro da janela de 7 dias. */}
      <CreditExpiryAlert batches={expiringBatches} />

      <DiscountBanner visible={isFirstPurchase} />

      <PricingCards
        isFirstPurchase={isFirstPurchase}
        initialPlan={selection?.plan ?? null}
        initialMonthlyLessons={selection?.monthlyLessons ?? null}
      />
    </PageWrapper>
  );
}
