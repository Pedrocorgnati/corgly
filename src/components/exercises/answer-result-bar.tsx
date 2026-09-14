'use client';

/**
 * Faixa de resultado de uma resposta conferida.
 *
 * EXTRACAO do bloco `exercise-result` de `exercise-multiple-choice.tsx`
 * (contrato observavel preservado: papel ARIA de status, regiao viva polida,
 * icones `aria-hidden` e os tokens success/destructive). O gabarito SEMPRE e
 * revelado e a resposta do aluno e repetida quando ele erra — o feedback
 * imediato e o produto.
 *
 * Nome: `AnswerResultBar` e contrato. O termo "feedback" fica reservado ao
 * model de avaliacao pedagogica que o professor escreve sobre a aula.
 *
 * `yourAnswer` so deve ser passada quando o aluno errou; o componente renderiza
 * a linha quando a prop existe, espelhando o `{!isCorrect && selectedOption}`
 * do card original.
 */

import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface AnswerResultEntry {
  letter: string;
  text: string;
}

interface AnswerResultBarProps {
  isCorrect: boolean;
  yourAnswer?: AnswerResultEntry;
  correctAnswer?: AnswerResultEntry;
}

export function AnswerResultBar({ isCorrect, yourAnswer, correctAnswer }: AnswerResultBarProps) {
  const t = useTranslations('exercises');

  return (
    <div
      data-testid="exercise-result"
      role="status"
      aria-live="polite"
      className={cn(
        'mt-4 rounded-xl border p-4',
        isCorrect ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {isCorrect ? (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        )}
        {isCorrect ? t('correctTitle') : t('incorrectTitle')}
      </p>
      {yourAnswer && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('yourAnswer', { letter: yourAnswer.letter, text: yourAnswer.text })}
        </p>
      )}
      {correctAnswer && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t('correctAnswer', { letter: correctAnswer.letter, text: correctAnswer.text })}
        </p>
      )}
    </div>
  );
}
