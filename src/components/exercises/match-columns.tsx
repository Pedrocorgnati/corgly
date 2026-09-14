'use client';

/**
 * Bloco de duas colunas do tipo MATCH_CLICK (selecao de par por clique ou
 * teclado, sem arrastar — D-009-3).
 *
 * Nome: `MatchColumns` e contrato. O termo "par" fica reservado a um elo
 * `{ leftId, rightId }` entre uma entrada da coluna A (idioma de apoio) e uma
 * da coluna B (PT); o pareamento correto e gabarito e NUNCA viaja no payload
 * — ele so chega na resposta do Conferir (`SubmitAnswerResponse.answerKey`).
 *
 * Na tentativa do aluno, o segundo clique valida somente o candidato no
 * servidor. Par correto fica fixo; par incorreto limpa apenas o candidato; uma
 * falha de rede preserva as duas selecoes para retry. O gabarito nunca viaja.
 *
 * O estado dos pares NAO mora aqui: sobe para o `DrillShell` via
 * `onPairsChange`, porque e o shell que confere (mesma razao de `selected`).
 *
 * Estados visuais usam token, icone e texto. A fase `checked` continua capaz de
 * mostrar o gabarito recebido somente depois do Conferir final.
 *
 * Cada entrada e `<button type="button">` nativo (Tab + Enter/Espaco sem
 * codigo extra) com alvo de toque `min-h-11` (44 px). O anel de foco usa o
 * mesmo token `ring-ring` do `answer-choices.tsx`; como o botao nao tem
 * filho focavel, a variante aplicada e `focus-visible:` direta (a forma
 * `has-[:focus-visible]` do fieldset de radios e inerte em botao sem filhos).
 */

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Link2, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { MatchEntry } from '@/lib/exercises';

/** Elo de pareamento montado pelo aluno ou vindo do gabarito do servidor. */
export interface MatchPair {
  leftId: string;
  rightId: string;
}

interface MatchColumnsProps {
  left: MatchEntry[];
  right: MatchEntry[];
  pairs: MatchPair[];
  phase: 'answering' | 'checked';
  correctPairs?: MatchPair[];
  onPairsChange: (pairs: MatchPair[]) => void;
  onValidatePair?: (pair: MatchPair) => Promise<{ isCorrect: boolean }>;
}

type PairFeedback = {
  kind: 'correct' | 'incorrect' | 'error';
  pair: MatchPair;
};

export function MatchColumns({
  left,
  right,
  pairs,
  phase,
  correctPairs,
  onPairsChange,
  onValidatePair,
}: MatchColumnsProps) {
  const t = useTranslations('exercises');

  // Selecao pendente de cada coluna: entrada livre clicada que ainda espera
  // a parceira da outra coluna para virar par.
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);
  const [pendingRight, setPendingRight] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<MatchPair | null>(null);
  const [validationState, setValidationState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [feedback, setFeedback] = useState<PairFeedback | null>(null);

  const leftById = new Map(left.map((entry) => [entry.id, entry]));
  const rightById = new Map(right.map((entry) => [entry.id, entry]));
  const pairByLeft = new Map(pairs.map((pair) => [pair.leftId, pair]));
  const pairByRight = new Map(pairs.map((pair) => [pair.rightId, pair]));

  const isCorrectPair = (pair: MatchPair) =>
    correctPairs?.some((cp) => cp.leftId === pair.leftId && cp.rightId === pair.rightId) ?? false;

  // Gabarito sempre visivel: pares certos que o aluno nao montou (ou montou
  // errado) reaparecem com o token de certo na fase `checked`.
  const missingCorrectPairs =
    phase === 'checked'
      ? (correctPairs ?? []).filter(
          (cp) => !pairs.some((pair) => pair.leftId === cp.leftId && pair.rightId === cp.rightId)
        )
      : [];

  const clearCandidate = () => {
    setPendingLeft(null);
    setPendingRight(null);
    setCandidate(null);
  };

  const validateCandidate = async (nextCandidate: MatchPair) => {
    setCandidate(nextCandidate);
    setValidationState('submitting');
    setFeedback(null);

    if (!onValidatePair) {
      onPairsChange([...pairs, nextCandidate]);
      clearCandidate();
      setValidationState('idle');
      return;
    }

    try {
      const result = await onValidatePair(nextCandidate);
      if (result.isCorrect) {
        onPairsChange([...pairs, nextCandidate]);
        clearCandidate();
        setFeedback({ kind: 'correct', pair: nextCandidate });
      } else {
        clearCandidate();
        setFeedback({ kind: 'incorrect', pair: nextCandidate });
      }
      setValidationState('idle');
    } catch {
      setValidationState('error');
      setFeedback({ kind: 'error', pair: nextCandidate });
    }
  };

  const handleEntryClick = (side: 'left' | 'right', id: string) => {
    if (phase !== 'answering' || validationState === 'submitting') return;

    // No fluxo imediato, um par correto fica fixo. O preview sem validador
    // preserva a edicao em lote anterior e permite desfazer.
    const existing = side === 'left' ? pairByLeft.get(id) : pairByRight.get(id);
    if (existing) {
      if (onValidatePair) return;
      onPairsChange(pairs.filter((pair) => pair !== existing));
      return;
    }

    setFeedback(null);
    setValidationState('idle');

    if (side === 'left') {
      if (pendingRight !== null) {
        const nextCandidate = { leftId: id, rightId: pendingRight };
        setPendingLeft(id);
        void validateCandidate(nextCandidate);
      } else {
        setPendingLeft(id);
      }
    } else {
      if (pendingLeft !== null) {
        const nextCandidate = { leftId: pendingLeft, rightId: id };
        setPendingRight(id);
        void validateCandidate(nextCandidate);
      } else {
        setPendingRight(id);
      }
    }
  };

  function renderEntry(side: 'left' | 'right', entry: MatchEntry) {
    const pair = side === 'left' ? pairByLeft.get(entry.id) : pairByRight.get(entry.id);
    const isPending = side === 'left' ? pendingLeft === entry.id : pendingRight === entry.id;
    const checkedCorrect = phase === 'checked' && pair !== undefined && isCorrectPair(pair);
    const checkedWrong = phase === 'checked' && pair !== undefined && !isCorrectPair(pair);
    const isCandidate =
      candidate !== null &&
      (side === 'left' ? candidate.leftId === entry.id : candidate.rightId === entry.id);
    const pairStatusId = pair ? `match-pair-status-${pair.leftId}-${pair.rightId}` : undefined;

    return (
      <button
        key={entry.id}
        type="button"
        data-testid={`match-entry-${side}-${entry.id}`}
        disabled={phase === 'checked'}
        aria-disabled={phase === 'checked' || (onValidatePair !== undefined && pair !== undefined)}
        aria-busy={validationState === 'submitting' && isCandidate}
        aria-pressed={isPending || pair !== undefined}
        aria-describedby={onValidatePair && pair ? pairStatusId : undefined}
        onClick={() => handleEntryClick(side, entry.id)}
        className={cn(
          'flex min-h-11 min-w-11 w-full items-center gap-2 rounded-xl border p-3.5 text-left text-sm leading-relaxed text-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          phase === 'checked' ? 'cursor-default' : 'hover:bg-muted/60',
          phase === 'answering' && (isPending || pair !== undefined)
            ? 'border-primary bg-primary/5'
            : 'border-border',
          checkedCorrect && 'border-success bg-success/10',
          checkedWrong && 'border-destructive bg-destructive/10'
        )}
      >
        <span className="min-w-0 flex-1">{entry.text}</span>
        {phase === 'answering' && pair !== undefined && (
          <Link2 className="ml-auto h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        )}
        {checkedCorrect && (
          <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        )}
        {checkedWrong && (
          <XCircle className="ml-auto h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        )}
        {side === 'left' && onValidatePair && pair && (
          <span id={pairStatusId} className="sr-only">
            {t('matchPairCorrectState')}
          </span>
        )}
      </button>
    );
  }

  return (
    <div data-testid="match-columns" aria-busy={validationState === 'submitting'}>
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        {t('matchPairsProgress', { matched: pairs.length, total: left.length })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div role="group" aria-label={t('matchLeftColumnLabel')} className="space-y-2.5">
          {left.map((entry) => renderEntry('left', entry))}
        </div>
        <div role="group" aria-label={t('matchRightColumnLabel')} className="space-y-2.5">
          {right.map((entry) => renderEntry('right', entry))}
        </div>
      </div>

      {validationState === 'submitting' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('matchPairChecking')}
        </p>
      )}

      {feedback && (
        <div
          data-testid="match-pair-feedback"
          className={cn(
            'mt-3 flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
            feedback.kind === 'correct' && 'border-success bg-success/10 text-success',
            feedback.kind !== 'correct' &&
              'border-destructive bg-destructive/10 text-destructive',
          )}
          role={feedback.kind === 'correct' ? 'status' : 'alert'}
          aria-live={feedback.kind === 'correct' ? 'polite' : 'assertive'}
        >
          {feedback.kind === 'correct' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {feedback.kind === 'correct'
              ? t('matchPairCorrectAnnouncement', {
                  left: leftById.get(feedback.pair.leftId)?.text ?? '',
                  right: rightById.get(feedback.pair.rightId)?.text ?? '',
                })
              : feedback.kind === 'incorrect'
                ? t('matchPairIncorrectAnnouncement', {
                    left: leftById.get(feedback.pair.leftId)?.text ?? '',
                    right: rightById.get(feedback.pair.rightId)?.text ?? '',
                  })
                : t('matchPairValidationError')}
          </span>
          {feedback.kind === 'error' && candidate && (
            <button
              type="button"
              className="ml-auto min-h-11 min-w-11 rounded-md px-3 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void validateCandidate(candidate)}
            >
              {t('matchPairRetry')}
            </button>
          )}
        </div>
      )}

      {phase === 'checked' && missingCorrectPairs.length > 0 && (
        <div data-testid="match-correct-pairs" className="mt-4 space-y-2">
          {missingCorrectPairs.map((pair) => (
            <div
              key={pair.leftId}
              data-testid={`match-correct-pair-${pair.leftId}`}
              className="flex items-center gap-2 rounded-xl border border-success bg-success/10 p-3 text-sm text-foreground"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>{leftById.get(pair.leftId)?.text}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>{rightById.get(pair.rightId)?.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
