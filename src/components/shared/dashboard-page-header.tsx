import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashboardPageHeaderProps {
  /** Linha curta acima do titulo (equivalente ao eyebrow do hero da landing). */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Chips de prova social do hero viram chips de contexto aqui. */
  chips?: ReactNode;
  /** Acoes alinhadas a direita (botoes, badges). */
  actions?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Faixa lilas de cabecalho de pagina.
 *
 * E o eco direto do hero da landing (`bg-hero-lilac` + titulo branco +
 * chips com borda translucida): mesmo gradiente, mesmo raio de 10px,
 * mesma sombra lilas. Usada pelo dashboard do aluno e do professor para
 * que as duas areas logadas abram com a mesma identidade da home.
 */
export function DashboardPageHeader({
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  className,
  'data-testid': testId,
}: DashboardPageHeaderProps) {
  return (
    <header
      data-testid={testId}
      className={cn(
        'bg-panel-lilac rounded-lg px-6 py-6 md:px-8 md:py-7 mb-6',
        'shadow-[var(--shadow-brand-md)]',
        'flex flex-col gap-5 md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[13px] font-semibold text-white/85 tracking-[0.01em] mb-1.5">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[1.65rem] md:text-[2rem] font-bold text-white leading-[1.15] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-[14.5px] text-white/90 leading-[1.5] max-w-[46ch]">{subtitle}</p>
        )}
        {chips && <ul className="mt-4 flex flex-wrap gap-2.5">{chips}</ul>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/**
 * Chip translucido do hero (`border-white/55 bg-white/20`), reaproveitado
 * como indicador de contexto no cabecalho dos dashboards.
 */
export function DashboardHeaderChip({
  icon: Icon,
  children,
  'data-testid': testId,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <li
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/55 bg-white/20 px-3.5 py-[7px] text-[13px] font-medium text-white"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </li>
  );
}
