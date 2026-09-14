'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

// ── Types ──

export interface UseDialogA11yOptions {
  /** Espelha a prop `open` do modal; fechado, nenhum listener fica ativo. */
  open: boolean;
  /**
   * Handler do controle de fechar que o estado atual MOSTRA. Esc e clique no
   * fundo reaproveitam esse handler em vez de virar um terceiro caminho de
   * saida. `null` quando o estado nao mostra controle de fechar: os dois ficam
   * inertes.
   */
  onDismiss: (() => void) | null;
  /**
   * Muda quando o conteudo do painel troca (ex.: o estado do modal). Se a troca
   * desmontou o elemento focado, o foco volta para o container do dialogo em
   * vez de cair no `body`, fora do modal.
   */
  focusKey: string;
}

export interface UseDialogA11yReturn<T extends HTMLElement> {
  /** Vai no container `role="dialog"`, que precisa de `tabIndex={-1}`. */
  dialogRef: RefObject<T | null>;
  /** Fecha so quando o alvo do clique e o proprio fundo, nunca o painel. */
  handleBackdropClick: (event: ReactMouseEvent<T>) => void;
}

// ── Helpers ──

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && !element.closest('[hidden]'),
  );
}

// ── Hook ──

/**
 * Esc, clique no fundo e prisao de foco para os modais proprios do calendario.
 *
 * O listener de teclado fica no `document`, e nao no container: quando o estado
 * troca e desmonta o botao focado, o foco cai no `body` e um `onKeyDown` no
 * container deixaria de ouvir Tab e Esc justamente nesse instante.
 *
 * Foco inicial: o proprio container, para que o primeiro Tab entre no painel sem
 * acionar nada por acidente. Ao fechar, o foco volta para o elemento que estava
 * focado antes da abertura, quando ele ainda existe no documento.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>({
  open,
  onDismiss,
  focusKey,
}: UseDialogA11yOptions): UseDialogA11yReturn<T> {
  const dialogRef = useRef<T | null>(null);
  const onDismissRef = useRef(onDismiss);

  // Os handlers dos modais sao recriados a cada render; o listener le sempre o
  // mais recente sem precisar ser reinstalado.
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = dialogRef.current;
    if (container && !container.contains(document.activeElement)) container.focus();
  }, [open, focusKey]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = dialogRef.current;
      if (!container) return;

      if (event.key === 'Escape') {
        const dismiss = onDismissRef.current;
        if (event.defaultPrevented || !dismiss) return;
        event.preventDefault();
        dismiss();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(container);
      // Estado sem nada focavel (ex.: so o spinner): o foco fica no container.
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusInsidePanel = active !== container && container.contains(active);

      if (event.shiftKey) {
        if (!focusInsidePanel || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!focusInsidePanel || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleBackdropClick = (event: ReactMouseEvent<T>) => {
    if (event.target !== event.currentTarget) return;
    onDismissRef.current?.();
  };

  return { dialogRef, handleBackdropClick };
}
