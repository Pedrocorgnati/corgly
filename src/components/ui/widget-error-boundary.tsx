'use client';

import { Component, type ErrorInfo, type ReactNode, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * Span da grade do dashboard (`md:col-span-2 lg:col-span-1`, ...).
   *
   * A grade e quem manda no span, e ela o entrega ao FILHO. Quando o filho
   * quebrava, o fallback entrava no lugar dele com um `<div>` sem classe
   * nenhuma: a celula perdia o span, os widgets vizinhos escorregavam e a
   * grade inteira se remontava so porque um card falhou. O fallback tem que
   * ocupar exatamente o mesmo espaco do widget que substituiu.
   */
  className?: string;
  /** Nome do widget, usado no log para saber QUAL card quebrou. */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Acao de recuperacao do fallback.
 *
 * Nao basta limpar `hasError`: os filhos deste boundary sao componentes de
 * servidor ja renderizados; remontar sem refazer a requisicao devolveria
 * exatamente a mesma arvore quebrada e o card piscaria de volta para o erro.
 * `router.refresh()` refaz a rota (o dashboard e `force-dynamic`) e so entao
 * soltamos o boundary, com o botao em estado ocupado enquanto isso.
 */
function WidgetErrorFallback({ onReset, className }: { onReset: () => void; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      data-testid="widget-error-boundary-fallback"
      role="alert"
      className={cn(
        'bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col items-center justify-center min-h-[100px] gap-2',
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-xs text-muted-foreground text-center">Erro ao carregar este widget</p>
      <button
        type="button"
        data-testid="widget-error-boundary-retry-button"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            router.refresh();
            onReset();
          });
        }}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {isPending ? 'Recarregando...' : 'Tentar novamente'}
      </button>
    </div>
  );
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      'Widget error boundary triggered',
      { widget: this.props.label ?? 'unknown', componentStack: info.componentStack },
      error,
    );
  }

  handleReset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <WidgetErrorFallback onReset={this.handleReset} className={this.props.className} />
        )
      );
    }

    return this.props.children;
  }
}
