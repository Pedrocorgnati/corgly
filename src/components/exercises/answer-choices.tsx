'use client';

/**
 * Fieldset de alternativas de um item de escolha (uma pergunta por vez).
 *
 * EXTRACAO do mapa de alternativas de `exercise-multiple-choice.tsx`
 * (contrato observavel preservado: `data-testid="exercise-question"` na
 * `legend`, `data-testid="exercise-option-{index}"` por alternativa, input
 * radio `sr-only`, `optionLabel` para leitor de tela e os tres estados
 * visuais — selecionada, correta, errada — com os mesmos tokens).
 *
 * Reusavel pelos tipos de escolha: `MULTIPLE_CHOICE` hoje, `TEXT_CHOICE`
 * quando o item 010 entrar. O `correctLetter` so e usado na fase `checked`,
 * quando o gabarito ja veio do servidor (ou, no card estatico, do dado da
 * aula).
 *
 * Os testids `exercise-question` (singular) e `exercise-option-0..N` so sao
 * unicos na tela porque so um item esta montado por viewport; montar varios
 * itens de uma vez exige renomea-los para incluir o indice do item.
 */

import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface AnswerChoiceOption {
  letter: string;
  text: string;
}

interface AnswerChoicesProps {
  questionId: string;
  prompt: string;
  options: readonly AnswerChoiceOption[];
  selected: string | null;
  phase: 'answering' | 'checked';
  correctLetter?: string;
  onSelect: (letter: string) => void;
}

export function AnswerChoices({
  questionId,
  prompt,
  options,
  selected,
  phase,
  correctLetter,
  onSelect,
}: AnswerChoicesProps) {
  const t = useTranslations('exercises');

  return (
    <fieldset disabled={phase === 'checked'} className="space-y-2.5">
      <legend
        data-testid="exercise-question"
        className="mb-3 text-base font-medium text-foreground"
      >
        {prompt}
      </legend>

      {options.map((option, optionIndex) => {
        const isSelectedOption = selected === option.letter;
        const showAsCorrect = phase === 'checked' && option.letter === correctLetter;
        const showAsWrong = phase === 'checked' && isSelectedOption && !showAsCorrect;

        return (
          <label
            key={option.letter}
            data-testid={`exercise-option-${optionIndex}`}
            className={cn(
              'flex min-h-11 min-w-11 cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              phase === 'checked' ? 'cursor-default' : 'hover:bg-muted/60',
              isSelectedOption && phase === 'answering'
                ? 'border-primary bg-primary/5'
                : 'border-border',
              showAsCorrect && 'border-success bg-success/10',
              showAsWrong && 'border-destructive bg-destructive/10',
            )}
          >
            <input
              type="radio"
              name={questionId}
              value={option.letter}
              checked={isSelectedOption}
              onChange={() => onSelect(option.letter)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase',
                isSelectedOption && phase === 'answering'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground',
                showAsCorrect && 'border-success bg-success text-success-foreground',
                showAsWrong && 'border-destructive bg-destructive text-destructive-foreground',
              )}
            >
              {option.letter}
            </span>
            <span className="sr-only">{t('optionLabel', { letter: option.letter })}</span>
            <span className="text-sm leading-relaxed text-foreground">{option.text}</span>
            {showAsCorrect && (
              <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            )}
            {showAsWrong && (
              <XCircle className="ml-auto h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
