import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Casca de largura de TODA pagina interna.
 *
 * `max-w-6xl` e a UNICA fonte de largura das paginas logadas: a pagina e o
 * `loading.tsx` correspondentes devem apenas envolver o conteudo neste
 * componente, sem reescrever `max-w-*` por fora (o dashboard do aluno fazia
 * `max-w-5xl` e o esqueleto repetia `max-w-6xl` na mao, entao pagina e
 * esqueleto tinham larguras diferentes e a tela pulava ao carregar).
 * `className` existe para espacamento e fundo, nao para largura.
 */
export function PageWrapper({ children, className, 'data-testid': testId }: PageWrapperProps) {
  return (
    <div data-testid={testId} className={cn('px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto', className)}>
      {children}
    </div>
  );
}
