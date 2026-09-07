'use client';

/**
 * Card interativo de exercicio de multipla escolha.
 *
 * Fluxo completo (uma questao por vez):
 *   escolher alternativa -> conferir -> ver o acerto/erro com a resposta certa
 *   -> avancar -> resumo final -> refazer.
 *
 * Uma questao por vez, e nao as oito de uma vez, e decisao de interface DESTA
 * tela: o aluno confere cada resposta e ve o acerto ou o erro antes de seguir,
 * o que so faz sentido com uma questao em foco. As regras da fonte
 * (corgly-classes/rules/09-secao6-multipla-escolha.md) governam o CONTEUDO das
 * questoes (R-MC-01 a R-MC-16) e nao dizem nada sobre apresentacao — trocar
 * para lista unica seria decisao de produto, nao quebra de contrato.
 *
 * Efeito colateral do formato: os testids `exercise-question` (singular) e
 * `exercise-option-0..3` sao unicos na tela porque so uma questao esta montada.
 * Este componente e a origem desses nomes; passar a montar as oito de uma vez
 * exige renomea-los para incluir o indice da questao.
 *
 * Zero Silencio: o botao de conferir NUNCA fica desabilitado. Clicar sem ter
 * escolhido alternativa mostra um aviso em `role="alert"` em vez de nao
 * responder. Conferir, avancar e refazer tem, cada um, retorno visivel e
 * anunciado para leitor de tela.
 *
 * O conteudo da aula (enunciado e alternativas) e dado da fonte e sai verbatim.
 * Todo o resto do texto vem do namespace `exercises` do next-intl.
 */

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveLessonText } from '@/lib/exercises';
import type { StaticExercise, OptionLetter } from '@/lib/exercises';

interface ExerciseMultipleChoiceProps {
  exercise: StaticExercise;
}

/**
 * `answering` = aguardando escolha; `checked` = resposta conferida, resultado a
 * vista; `finished` = todas as questoes conferidas, resumo a vista.
 */
type Phase = 'answering' | 'checked' | 'finished';

export function ExerciseMultipleChoice({ exercise }: ExerciseMultipleChoiceProps) {
  const t = useTranslations('exercises');
  const locale = useLocale();

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<OptionLetter | null>(null);
  const [phase, setPhase] = useState<Phase>('answering');
  const [hits, setHits] = useState(0);
  const [missingSelection, setMissingSelection] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const total = exercise.questions.length;
  const question = exercise.questions[index];

  const handleSelect = useCallback((letter: OptionLetter) => {
    setSelected(letter);
    setMissingSelection(false);
    setAnnouncement('');
  }, []);

  const handleCheck = useCallback(() => {
    if (!question) return;

    // Zero Silencio: sem escolha o clique vira aviso, nao vira nada.
    if (selected === null) {
      setMissingSelection(true);
      return;
    }

    setMissingSelection(false);
    setAnnouncement('');
    if (selected === question.correctLetter) {
      setHits((current) => current + 1);
    }
    setPhase('checked');
  }, [question, selected]);

  const handleNext = useCallback(() => {
    setAnnouncement('');
    if (index >= total - 1) {
      setPhase('finished');
      return;
    }
    setIndex((current) => current + 1);
    setSelected(null);
    setPhase('answering');
  }, [index, total]);

  const handleRetry = useCallback(() => {
    setIndex(0);
    setSelected(null);
    setPhase('answering');
    setHits(0);
    setMissingSelection(false);
    setAnnouncement(t('restarted'));
  }, [t]);

  // Zero Estados Indefinidos: aula copiada sem questoes ainda renderiza um card
  // legivel. O catalogo ja barra esse caso, este ramo e a rede de seguranca.
  if (total === 0 || !question) {
    return (
      <article
        data-testid="exercise-card"
        className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"
      >
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted-foreground">{t('emptyExercise')}</p>
      </article>
    );
  }

  const isLastQuestion = index === total - 1;
  const isCorrect = phase === 'checked' && selected === question.correctLetter;
  const correctOption = question.options.find((option) => option.letter === question.correctLetter);
  const selectedOption = question.options.find((option) => option.letter === selected);
  const answeredCount = phase === 'finished' ? total : index + (phase === 'checked' ? 1 : 0);
  const progressPercent = Math.round((answeredCount / total) * 100);

  return (
    <article
      data-testid="exercise-card"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6"
    >
      <header className="mb-5 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
            {t('lessonBadge', { number: exercise.lessonNumber })}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {t('levelBadge', { level: exercise.level })}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {t('kindMultipleChoice')}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {t('questionCount', { count: total })}
          </span>
        </div>

        <h2 className="mt-3 text-lg font-semibold text-foreground">{exercise.lessonTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('instructions')}</p>

        <details data-testid="exercise-grammar" className="group mt-3">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {t('grammarToggle')}
          </summary>
          <div className="mt-2 rounded-xl bg-muted/50 p-4">
            <p className="text-sm font-medium text-foreground">{exercise.grammarPoint.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {resolveLessonText(exercise.grammarPoint.explanation, locale)}
            </p>
          </div>
        </details>
      </header>

      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground">
          {phase === 'finished'
            ? t('progressDone', { total })
            : t('progress', { current: index + 1, total })}
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {phase === 'finished' ? (
        <div
          data-testid="exercise-summary"
          role="status"
          aria-live="polite"
          className="rounded-xl border border-border bg-muted/40 p-6 text-center"
        >
          <Trophy className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">{t('summaryTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('summaryScore', { correct: hits, total })}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{t('summaryHint')}</p>
        </div>
      ) : (
        <>
          <fieldset disabled={phase === 'checked'} className="space-y-2.5">
            <legend
              data-testid="exercise-question"
              className="mb-3 text-base font-medium text-foreground"
            >
              {question.prompt}
            </legend>

            {question.options.map((option, optionIndex) => {
              const isSelectedOption = selected === option.letter;
              const showAsCorrect = phase === 'checked' && option.letter === question.correctLetter;
              const showAsWrong = phase === 'checked' && isSelectedOption && !showAsCorrect;

              return (
                <label
                  key={option.letter}
                  data-testid={`exercise-option-${optionIndex}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
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
                    name={question.id}
                    value={option.letter}
                    checked={isSelectedOption}
                    onChange={() => handleSelect(option.letter)}
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

          {missingSelection && (
            <p
              data-testid="exercise-warning"
              role="alert"
              className="mt-3 flex items-center gap-2 text-sm text-destructive"
            >
              <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('noSelectionWarning')}
            </p>
          )}

          {phase === 'checked' && (
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
              {!isCorrect && selectedOption && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('yourAnswer', { letter: selectedOption.letter, text: selectedOption.text })}
                </p>
              )}
              {correctOption && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('correctAnswer', { letter: correctOption.letter, text: correctOption.text })}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {phase === 'answering' && (
          <Button data-testid="exercise-check-button" size="lg" onClick={handleCheck}>
            {t('checkButton')}
          </Button>
        )}

        {phase === 'checked' && (
          <Button data-testid="exercise-next-button" size="lg" onClick={handleNext}>
            {isLastQuestion ? t('finishButton') : t('nextButton')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        <Button
          data-testid="exercise-retry-button"
          size="lg"
          variant={phase === 'finished' ? 'default' : 'outline'}
          onClick={handleRetry}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('retryButton')}
        </Button>
      </div>

      {/* Retorno falado do "refazer": a tela volta ao inicio sem mudanca visivel
          de layout, entao o anuncio e o unico sinal para leitor de tela. */}
      <p data-testid="exercise-announcement" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </article>
  );
}
