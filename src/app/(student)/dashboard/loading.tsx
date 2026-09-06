import { PageWrapper } from '@/components/shared';

/**
 * Esqueleto do dashboard do aluno.
 *
 * Espelha 1:1 a grade real de `page.tsx` (mesma largura via PageWrapper,
 * mesmo `gap-6` e MESMOS spans) para que a troca esqueleto -> conteudo nao
 * empurre a pagina. Se a grade de `page.tsx` mudar, este arquivo muda junto.
 */
const SKELETON_CARDS: ReadonlyArray<{ key: string; span: string; lines: number }> = [
  { key: 'credits', span: '', lines: 3 },
  { key: 'next-session', span: '', lines: 3 },
  { key: 'quick-actions', span: 'md:col-span-2 lg:col-span-1', lines: 2 },
  { key: 'quick-stats', span: 'md:col-span-2 lg:col-span-3', lines: 2 },
  { key: 'corgly-circle', span: 'md:col-span-2 lg:col-span-2', lines: 4 },
  { key: 'recent-feedback', span: 'md:col-span-2 lg:col-span-1', lines: 3 },
];

export default function DashboardLoading() {
  return (
    <PageWrapper data-testid="dashboard-loading">
      <div aria-hidden="true" className="animate-pulse">
        {/* Faixa lilas do cabecalho (DashboardPageHeader) */}
        <div className="bg-panel-lilac rounded-lg px-6 py-6 md:px-8 md:py-7 mb-6">
          <div className="h-3.5 w-32 rounded bg-white/30" />
          <div className="mt-3 h-8 w-56 rounded bg-white/40" />
          <div className="mt-3 h-4 w-72 max-w-full rounded bg-white/25" />
          <div className="mt-4 flex flex-wrap gap-2.5">
            <div className="h-8 w-28 rounded-lg bg-white/25" />
            <div className="h-8 w-36 rounded-lg bg-white/25" />
            <div className="h-8 w-40 rounded-lg bg-white/25" />
          </div>
        </div>

        {/* Grade — os spans sao os mesmos do SPAN de page.tsx */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SKELETON_CARDS.map((card) => (
            <div key={card.key} className={`card-corgly flex flex-col p-6 ${card.span}`}>
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="mt-2 h-[3px] w-10 rounded bg-muted" />
              <div className="mt-5 flex flex-col gap-3">
                {Array.from({ length: card.lines }).map((_, index) => (
                  <div key={index} className="h-4 w-full rounded bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Carregando o painel do aluno.
      </span>
    </PageWrapper>
  );
}
