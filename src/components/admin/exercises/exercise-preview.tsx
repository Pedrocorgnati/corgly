'use client';

/**
 * Preview jogavel do professor dentro do formulario (item 014).
 *
 * Simula o `DrillShell` do aluno em modo efemero: mesma maquina de fases
 * (`answering -> checked -> finished`), mesmos renderers (`AnswerChoices`,
 * `MatchColumns`, `ClozeText`), mesma `AnswerResultBar`, mas SEM nenhuma
 * chamada de API. O gabarito ja esta em `form.items[]` (`correctIndex`,
 * `canonical` + `acceptedText`, `pairs`).
 *
 * Diferenca de estado em relacao ao aluno:
 * - Nenhum registro de tentativa ou resposta e criado.
 * - O feedback e calculado localmente.
 * - Ao final, "Simulacao concluida" com botao "Refazer" in-place.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AnswerChoices,
  AnswerResultBar,
  MatchColumns,
  ClozeText,
} from '@/components/exercises';
import type { MatchPair } from '@/components/exercises';
import {
  matchesAnswerKey,
  OPTION_LETTERS,
  OPTIONS_PER_QUESTION,
} from '@/lib/exercises';
import type { ExerciseItemForm } from '../exercise-editor';

const VERB_TENSE_LABELS: Record<string, string> = {
  PRESENTE_INDICATIVO: 'Presente do indicativo',
};

/** Fases da maquina de preview. */
type Phase = 'answering' | 'checked' | 'finished';

/** Resultado da correcao de cada tipo. */
interface CheckResult {
  isCorrect: boolean;
  yourAnswer?: { letter: string; text: string };
  correctAnswer?: { letter: string; text: string };
}

interface ExercisePreviewProps {
  items: ExerciseItemForm[];
  onClose: () => void;
}

export function ExercisePreview({ items, onClose }: ExercisePreviewProps) {
  // Estado do preview
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('answering');
  const [selected, setSelected] = useState<string | null>(null);
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([]);
  const [verbAnswer, setVerbAnswer] = useState('');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [hits, setHits] = useState(0);
  const [missingSelection, setMissingSelection] = useState(false);

  const item = items[index];
  const totalItems = items.length;
  const isLastItem = index === totalItems - 1;

  // --- Helpers de validacao de selecao ---

  function hasSelection(): boolean {
    if (item.kind === 'MULTIPLE_CHOICE' || item.kind === 'TEXT_CHOICE') {
      return selected !== null;
    }
    if (item.kind === 'MATCH_CLICK') {
      return matchPairs.length === item.pairs.length;
    }
    if (item.kind === 'VERB_CLOZE') {
      return verbAnswer.trim().length > 0;
    }
    return false;
  }

  // --- Correcao local por tipo ---

  function handleCheck() {
    if (phase !== 'answering') return;

    // Zero Silencio: selecao incompleta vira aviso, nao bloqueio
    if (!hasSelection()) {
      setMissingSelection(true);
      return;
    }

    setMissingSelection(false);
    let result: CheckResult;

    if (item.kind === 'MULTIPLE_CHOICE' || item.kind === 'TEXT_CHOICE') {
      const correctLetter = OPTION_LETTERS[item.correctIndex];
      const isCorrect = selected === correctLetter;
      const selectedIdx = selected ? OPTION_LETTERS.indexOf(selected as 'a' | 'b' | 'c' | 'd' | 'e') : -1;
      const yourAnswer = isCorrect
        ? undefined
        : { letter: selected!, text: item.options[selectedIdx] ?? '' };
      const correctAnswer = {
        letter: correctLetter as 'a' | 'b' | 'c' | 'd' | 'e',
        text: item.options[item.correctIndex] ?? '',
      };
      result = { isCorrect, yourAnswer, correctAnswer };
    } else if (item.kind === 'MATCH_CLICK') {
      // Equivalencia por conjunto, independente da ordem de interacao
      const expectedSet = new Set(
        item.pairs.map(({ leftId, rightId }) => `${leftId}>${rightId}`)
      );
      const isCorrect =
        matchPairs.length === item.pairs.length &&
        matchPairs.every((p) => expectedSet.has(`${p.leftId}>${p.rightId}`));
      result = { isCorrect };
    } else if (item.kind === 'VERB_CLOZE') {
      // Reutiliza matchesAnswerKey do aluno
      const accepted = item.acceptedText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const isCorrect = matchesAnswerKey(
        verbAnswer,
        { canonical: item.canonical, accepted },
        { acceptWithoutAccent: item.acceptWithoutAccent }
      );
      result = { isCorrect };
    } else {
      // never: kind exaustivo
      result = { isCorrect: false };
    }

    if (result.isCorrect) {
      setHits((h) => h + 1);
    }
    setCheckResult(result);
    setPhase('checked');
  }

  // --- Navegacao ---

  function handleNext() {
    if (phase !== 'checked') return;

    if (isLastItem) {
      setPhase('finished');
    } else {
      // Avanca e limpa selecao
      setIndex((i) => i + 1);
      setPhase('answering');
      setSelected(null);
      setMatchPairs([]);
      setVerbAnswer('');
      setCheckResult(null);
      setMissingSelection(false);
    }
  }

  function handleRetry() {
    // Reset total
    setIndex(0);
    setPhase('answering');
    setSelected(null);
    setMatchPairs([]);
    setVerbAnswer('');
    setCheckResult(null);
    setHits(0);
    setMissingSelection(false);
  }

  function handleChoiceSelect(letter: string) {
    if (phase !== 'answering') return;
    setSelected(letter);
    setMissingSelection(false);
  }

  function handleMatchPairsChange(pairs: MatchPair[]) {
    if (phase !== 'answering') return;
    setMatchPairs(pairs);
    setMissingSelection(false);
  }

  function handleVerbAnswerChange(text: string) {
    if (phase !== 'answering') return;
    setVerbAnswer(text);
    setMissingSelection(false);
  }

  // --- Renderers por tipo ---

  function renderItem() {
    if (!item) return null;

    // Renderers so aceitam 'answering' | 'checked'; 'finished' nunca chega aqui
    const rendererPhase = phase as 'answering' | 'checked';

    switch (item.kind) {
      case 'MULTIPLE_CHOICE':
      case 'TEXT_CHOICE': {
        const visibleOptions =
          item.kind === 'MULTIPLE_CHOICE'
            ? item.options.slice(0, OPTIONS_PER_QUESTION)
            : item.options;
        const options = visibleOptions.map((text, i) => ({
          letter: OPTION_LETTERS[i]!,
          text,
        }));
        const correctLetter =
          phase === 'checked'
            ? (OPTION_LETTERS[item.correctIndex] as 'a' | 'b' | 'c' | 'd' | 'e')
            : undefined;
        return (
          <div>
            {item.kind === 'TEXT_CHOICE' && (
              <div
                data-testid="reading-text"
                className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground"
              >
                {item.readingText}
              </div>
            )}
            <AnswerChoices
              questionId={`preview-item-${index}`}
              prompt={item.prompt}
              options={options}
              selected={selected}
              phase={rendererPhase}
              correctLetter={correctLetter}
              onSelect={handleChoiceSelect}
            />
          </div>
        );
      }
      case 'MATCH_CLICK': {
        const correctPairs = phase === 'checked' ? item.pairs : undefined;
        return (
          <MatchColumns
            left={item.left}
            right={item.right}
            pairs={matchPairs}
            phase={rendererPhase}
            correctPairs={correctPairs}
            onPairsChange={handleMatchPairsChange}
          />
        );
      }
      case 'VERB_CLOZE': {
        const tenseLabel = VERB_TENSE_LABELS[item.tense] ?? item.tense;
        const isCorrect = phase === 'checked' ? checkResult?.isCorrect : undefined;
        const correctForm = phase === 'checked' && !isCorrect ? item.canonical : undefined;
        return (
          <ClozeText
            infinitive={item.infinitive}
            tenseLabel={tenseLabel}
            sentence={item.sentence}
            value={verbAnswer}
            phase={rendererPhase}
            isCorrect={isCorrect}
            correctForm={correctForm}
            onChange={handleVerbAnswerChange}
            onSubmit={handleCheck}
          />
        );
      }
      default:
        // never: discriminador exaustivo
        return null;
    }
  }

  function renderResultBar() {
    if (phase !== 'checked' || !checkResult) return null;

    return (
      <div data-testid="admin-exercise-preview-result-bar">
        <AnswerResultBar
          isCorrect={checkResult.isCorrect}
          yourAnswer={checkResult.yourAnswer}
          correctAnswer={checkResult.correctAnswer}
        />
        {item.kind === 'VERB_CLOZE' && (
          <p
            data-testid="admin-exercise-preview-verb-correct-answer"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-success bg-success/10 p-3 text-sm text-foreground"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>Resposta correta: {item.canonical}</span>
          </p>
        )}
      </div>
    );
  }

  // --- Layout ---

  return (
    <div
      data-testid="admin-exercise-preview"
      className="flex max-h-[90dvh] max-w-2xl flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Preview</h2>
        <button
          data-testid="admin-exercise-preview-close-button"
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Sair
        </button>
      </div>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {phase !== 'finished' && (
          <>
            {/* Progresso */}
            <div
              data-testid="admin-exercise-preview-progress"
              className="mb-4 flex items-center gap-3"
            >
              <Progress
                value={((index + 1) / totalItems) * 100}
                aria-label="Progresso do preview"
                aria-valuetext={`Questão ${index + 1} de ${totalItems}`}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {index + 1}/{totalItems}
              </span>
            </div>

            {/* Item corrente */}
            <div data-testid={`admin-exercise-preview-item-${index + 1}`} className="space-y-4">
              {renderItem()}
              {missingSelection && (
                <p role="alert" className="text-sm text-destructive">
                  Selecione uma resposta antes de conferir.
                </p>
              )}
              {renderResultBar()}
            </div>
          </>
        )}

        {phase === 'finished' && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
            <h3 className="text-lg font-semibold">Simulação concluída</h3>
            <p data-testid="admin-exercise-preview-score" className="text-sm text-muted-foreground">
              {hits} de {totalItems} acertos
            </p>
            <Button
              data-testid="admin-exercise-preview-retry-button"
              variant="outline"
              onClick={handleRetry}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Refazer
            </Button>
          </div>
        )}
      </div>

      {/* Footer com acoes */}
      {phase !== 'finished' && (
        <div className="border-t px-4 py-3">
          {phase === 'answering' && (
            <Button onClick={handleCheck} className="w-full">
              Conferir
            </Button>
          )}
          {phase === 'checked' && (
            <Button onClick={handleNext} className="w-full">
              {isLastItem ? 'Finalizar' : 'Continuar'}
              <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
