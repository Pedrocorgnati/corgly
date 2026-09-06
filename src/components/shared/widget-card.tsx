import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type WidgetAccent = 'brand' | 'amber' | 'success' | 'destructive' | 'none';

interface WidgetCardProps {
  title?: ReactNode;
  /** Glifo lilas do cartao (mesmo tratamento dos pilares do metodo). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Cor da regua sob o titulo. `none` remove a regua. */
  accent?: WidgetAccent;
  /** Conteudo alinhado a direita do titulo (contador, botao de refresh). */
  action?: ReactNode;
  /** Card em destaque — borda lilas de 2px, como o plano "mais escolhido". */
  featured?: boolean;
  /** Rodape separado por hairline (link "ver tudo"). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
}

const ACCENT_CLASS: Record<WidgetAccent, string> = {
  brand: 'rule-corgly',
  amber: 'rule-corgly rule-corgly-amber',
  success: 'rule-corgly bg-success!',
  destructive: 'rule-corgly bg-destructive!',
  none: '',
};

/**
 * Cartao branco do dashboard.
 *
 * Reproduz o cartao da landing (pilares do metodo / planos da pricing):
 * superficie branca, raio de 10px, sombra lilas suave, titulo em tinta
 * navy e regua fina de 3px sob o titulo. E a unica casca usada pelos
 * widgets do aluno e do professor, para que os dois dashboards tenham o
 * mesmo desenho de card da home.
 */
export function WidgetCard({
  title,
  icon: Icon,
  accent = 'brand',
  action,
  featured = false,
  footer,
  children,
  className,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: WidgetCardProps) {
  const hasHeader = Boolean(title || action);

  return (
    <div
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(
        featured ? 'card-corgly-featured' : 'card-corgly',
        'flex flex-col p-6',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold text-ink leading-tight">
              {Icon && <Icon className="h-[1.15rem] w-[1.15rem] text-brand-500 flex-shrink-0" />}
              {title}
            </h2>
            {accent !== 'none' && <span className={cn('mt-2', ACCENT_CLASS[accent])} />}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
      {footer && <div className="mt-4 pt-4 border-t border-border">{footer}</div>}
    </div>
  );
}
