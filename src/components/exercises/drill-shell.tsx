'use client';

/**
 * Casca da tentativa de exercicio (tela cheia, um item por vez).
 *
 * Layout em tres faixas: header (fechar, titulo, progresso), corpo (renderer
 * do tipo do item corrente) e footer (Conferir / faixa de resultado +
 * Continuar / Refazer).
 *
 * Nome: `DrillShell` e contrato. O termo "sessao" fica reservado a aula ao
 * vivo (model `Session`, sala WebRTC, shell proprio no dashboard).
 *
 * Maquina de fases portada de `exercise-multiple-choice.tsx`
 * (`answering -> checked -> finished`), com as mesmas regras de Zero Silencio:
 * o Conferir sem escolha vira aviso em `role="alert"`; durante o POST ele
 * mostra spinner, fica desabilitado e usa trava sincrona contra reentrada. O
 * avanco so acontece no Continuar. Refazer abandona somente a tentativa ainda
 * ativa e abre outra pelo endpoint canonico, sem reutilizar estado persistido.
 *
 * Diferenca de fonte de dado em relacao ao card estatico (D-008-3): o
 * gabarito NAO vem no envelope (`getPlayableForStudent` omite `answerKey` de
 * proposito). Conferir e POST na rota de respostas e quem devolve o gabarito
 * e `submitAnswer` (`{ isCorrect, answerKey, ... }`). O comportamento visivel
 * e identico ao do card.
 *
 * O renderer discrimina por `switch (item.kind)` exaustivo com ramo `default`
 * marcado `never`: adicionar um tipo a `ExerciseItemKind` sem tratar aqui
 * reprova em `tsc` (pre-requisito dos itens 009 e 010).
 *
 * Fechar persiste a tentativa como retomavel antes de voltar para a lista. Ao
 * responder o ultimo item, o shell finaliza no servidor e navega para o resumo
 * revisavel. Progresso e conclusao usam o `itemCount` congelado da tentativa.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BookOpen,
  ChevronRight,
  CircleAlert,
  Loader2,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AnswerChoices } from './answer-choices';
import { AnswerResultBar } from './answer-result-bar';
import { MatchColumns } from './match-columns';
import type { MatchPair } from './match-columns';
import { ClozeText } from './cloze-text';
import { API, ROUTES } from '@/lib/constants/routes';
import { OPTION_LETTERS } from '@/lib/exercises';
import type { OptionLetter } from '@/lib/exercises';
import {
  EXERCISE_ITEM_SCHEMAS_BY_KIND,
  type ExerciseItemKind,
} from '@/lib/exercises/exercise-item.schema';

/** Item jogavel do envelope de `getPlayableForStudent` (sem `answerKey`). */
export interface DrillItem {
  id: string;
  kind: ExerciseItemKind;
  position: number;
  payload: unknown;
}

export interface DrillExercise {
  id: string;
  title: string;
  items: DrillItem[];
}

interface DrillShellProps {
  exercise: DrillExercise;
}

/**
 * `answering` = aguardando escolha; `checked` = resposta conferida, resultado a
 * vista; `finished` = todos os itens conferidos, resumo a vista.
 */
type Phase = 'answering' | 'checked' | 'finished';

/** `starting` = POST de inicio/retomada em voo; `error` = falhou, com retry. */
type StartState = 'starting' | 'ready' | 'error';

/** `submitting` = POST da resposta em voo; `error` = falhou, selecao preservada. */
type CheckState = 'idle' | 'submitting' | 'error';

interface AnswerEntry {
  letter: string;
  text: string;
}

interface CheckResult {
  isCorrect: boolean;
  yourAnswer?: AnswerEntry;
  correctAnswer?: AnswerEntry;
}

/** Kinds jogaveis no drill nesta fase; o `switch` de montagem da resposta e exaustivo sobre eles. */
type PlayableKind = 'MULTIPLE_CHOICE' | 'MATCH_CLICK' | 'TEXT_CHOICE' | 'VERB_CLOZE';

/**
 * Monta o corpo da resposta por kind, exaustivo sobre os kinds jogaveis: um
 * kind jogavel novo sem caso aqui reprova em `tsc` pelo `never` do `default`.
 */
function buildAnswerBody(
  kind: PlayableKind,
  selected: string | null,
  matchPairs: MatchPair[],
  verbAnswer: string
): Record<string, unknown> {
  switch (kind) {
    case 'MULTIPLE_CHOICE':
      return {
        kind: 'MULTIPLE_CHOICE',
        selectedIndex: OPTION_LETTERS.indexOf(selected as OptionLetter),
      };
    case 'MATCH_CLICK':
      return { kind: 'MATCH_CLICK', pairs: matchPairs };
    case 'TEXT_CHOICE':
      return {
        kind: 'TEXT_CHOICE',
        selectedIndex: OPTION_LETTERS.indexOf(selected as OptionLetter),
      };
    case 'VERB_CLOZE':
      return { kind: 'VERB_CLOZE', text: verbAnswer.trim() };
    default: {
      const exhaustive: never = kind;
      throw new Error(`Kind sem corpo de resposta: ${String(exhaustive)}`);
    }
  }
}

interface AttemptStartResponse {
  data?: {
    attempt?: {
      id: string;
      answeredCount: number;
      correctCount: number;
      itemCount: number;
      answeredItemIds?: string[];
    };
  };
}

interface SubmitAnswerResponse {
  data?: {
    isCorrect: boolean;
    answerKey: unknown;
    answeredCount: number;
    correctCount: number;
    itemCount: number;
  };
}

interface MatchCheckResponse {
  data?: {
    isCorrect?: boolean;
  };
}

interface FinishAttemptResponse {
  data?: {
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  };
}

type TransitionState = 'idle' | 'submitting' | 'error';

export function DrillShell({ exercise }: DrillShellProps) {
  const t = useTranslations('exercises');
  const router = useRouter();

  const items = exercise.items;

  const [startState, setStartState] = useState<StartState>('starting');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptItemCount, setAttemptItemCount] = useState(items.length);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([]);
  const [matchCorrectPairs, setMatchCorrectPairs] = useState<MatchPair[] | null>(null);
  const [verbAnswer, setVerbAnswer] = useState('');
  const [verbCorrectForm, setVerbCorrectForm] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('answering');
  const [hits, setHits] = useState(0);
  const [missingSelection, setMissingSelection] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [finishState, setFinishState] = useState<TransitionState>('idle');
  const [closeState, setCloseState] = useState<TransitionState>('idle');
  const [retryState, setRetryState] = useState<TransitionState>('idle');
  const checkInFlightRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const abandonedForRetryRef = useRef<string | null>(null);

  const attemptItems = items.slice(0, attemptItemCount);
  const total = attemptItemCount;

  // Retomar e o caminho normal, nao conflito: a rota devolve a tentativa
  // IN_PROGRESS existente. Como o drill so avanca em ordem, os itens
  // respondidos sao sempre um prefixo — `answeredCount` e o indice de retomada.
  const startAttempt = useCallback(async () => {
    setStartState('starting');
    try {
      const res = await fetch(API.EXERCISES.ATTEMPTS(exercise.id), {
        method: 'POST',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => null)) as AttemptStartResponse | null;
      const attempt = json?.data?.attempt;
      if (!res.ok || !attempt) throw new Error('Falha ao iniciar tentativa.');

      setAttemptId(attempt.id);
      setAttemptItemCount(attempt.itemCount);
      setAnsweredCount(attempt.answeredCount);
      setHits(attempt.correctCount);

      const answeredIds = new Set(attempt.answeredItemIds ?? []);
      const firstUnanswered =
        answeredIds.size > 0
          ? items.slice(0, attempt.itemCount).findIndex((item) => !answeredIds.has(item.id))
          : -1;
      const fallbackIndex = Math.min(
        attempt.answeredCount,
        Math.max(Math.min(attempt.itemCount, items.length) - 1, 0),
      );
      setIndex(firstUnanswered >= 0 ? firstUnanswered : fallbackIndex);
      setStartState('ready');
    } catch {
      setStartState('error');
    }
  }, [exercise.id, items]);

  // A rota de attempts e idempotente (sem 409), entao o disparo duplo do
  // StrictMode em dev nao cria tentativa duplicada: a segunda chamada retoma.
  useEffect(() => {
    void startAttempt();
  }, [startAttempt]);

  const persistOpenAttempt = useCallback(
    (keepalive = false) => {
      if (!attemptId) return Promise.resolve(null);
      return fetch(API.EXERCISES.ATTEMPT(attemptId), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
        keepalive,
      });
    },
    [attemptId],
  );

  // `beforeunload` nao permite aguardar a resposta; `keepalive` entrega o PATCH.
  // O AbortController governa o listener e garante cleanup sem callback orfao.
  useEffect(() => {
    if (!attemptId || phase === 'finished') return;

    const controller = new AbortController();
    const handleBeforeUnload = () => {
      void persistOpenAttempt(true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload, { signal: controller.signal });
    return () => controller.abort();
  }, [attemptId, persistOpenAttempt, phase]);

  const handleSelect = useCallback((letter: string) => {
    setSelected(letter);
    setMissingSelection(false);
    setAnnouncement('');
  }, []);

  // Os pares sobem para o shell porque e o shell que confere (D-009-5, mesma
  // razao de `selected`).
  const handlePairsChange = useCallback((pairs: MatchPair[]) => {
    setMatchPairs(pairs);
    setMissingSelection(false);
    setAnnouncement('');
  }, []);

  // O texto do cloze sobe para o shell pela mesma razao (D-010-4).
  const handleVerbChange = useCallback((text: string) => {
    setVerbAnswer(text);
    setMissingSelection(false);
    setAnnouncement('');
  }, []);

  const handleValidateMatchPair = useCallback(
    async (pair: MatchPair) => {
      const item = attemptItems[index];
      if (!item || item.kind !== 'MATCH_CLICK' || !attemptId) {
        throw new Error('Candidato de par sem tentativa ativa.');
      }

      const response = await fetch(
        API.EXERCISES.ATTEMPT_MATCH_CHECK(exercise.id, attemptId, item.id),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pair),
        },
      );
      const body = (await response.json().catch(() => null)) as MatchCheckResponse | null;
      const isCorrect = body?.data?.isCorrect;
      if (!response.ok || typeof isCorrect !== 'boolean') {
        throw new Error('Falha ao validar o par.');
      }

      return { isCorrect };
    },
    [attemptId, attemptItems, exercise.id, index],
  );

  const handleCheck = useCallback(async () => {
    const item = attemptItems[index];
    if (
      !item ||
      !attemptId ||
      phase !== 'answering' ||
      checkState === 'submitting' ||
      checkInFlightRef.current
    ) return;

    // So os kinds jogaveis chegam ao POST; os demais o renderer rejeita no corpo.
    if (
      item.kind !== 'MULTIPLE_CHOICE' &&
      item.kind !== 'MATCH_CLICK' &&
      item.kind !== 'TEXT_CHOICE' &&
      item.kind !== 'VERB_CLOZE'
    ) {
      return;
    }

    // Zero Silencio por kind: selecao incompleta vira aviso, nao vira nada.
    // MULTIPLE_CHOICE e TEXT_CHOICE exigem uma alternativa; VERB_CLOZE exige
    // texto; MATCH_CLICK exige todos os pares.
    if ((item.kind === 'MULTIPLE_CHOICE' || item.kind === 'TEXT_CHOICE') && selected === null) {
      setMissingSelection(true);
      return;
    }
    if (item.kind === 'VERB_CLOZE' && verbAnswer.trim() === '') {
      setMissingSelection(true);
      return;
    }
    if (item.kind === 'MATCH_CLICK') {
      const matchPayload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.payload.parse(item.payload);
      if (matchPairs.length !== matchPayload.left.length) {
        setMissingSelection(true);
        return;
      }
    }

    const answer = buildAnswerBody(item.kind, selected, matchPairs, verbAnswer);
    checkInFlightRef.current = true;
    setMissingSelection(false);
    setAnnouncement('');
    setCheckState('submitting');

    try {
      const res = await fetch(API.EXERCISES.ATTEMPT_ANSWERS(exercise.id, attemptId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          answer,
        }),
      });
      const json = (await res.json().catch(() => null)) as SubmitAnswerResponse | null;
      const data = json?.data;
      if (!res.ok || !data) throw new Error('Falha ao conferir resposta.');

      // O gabarito volta AQUI de proposito: o feedback imediato e o produto.
      if (item.kind === 'MATCH_CLICK') {
        // Pares: o detalhe do gabarito fica no MatchColumns, par a par; a
        // barra de resultado mostra so o veredito global (D-009-2).
        const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.answerKey.safeParse(
          data.answerKey,
        );
        if (!answerKey.success) throw new Error('Gabarito MATCH_CLICK invalido.');
        setMatchCorrectPairs(answerKey.data.pairs);
        setCheckResult({ isCorrect: data.isCorrect });
      } else if (item.kind === 'VERB_CLOZE') {
        // Cloze nao tem letra: a forma canonica fica visivel no proprio
        // ClozeText na fase `checked` e a barra mostra so o veredito global
        // (D-010-2).
        const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.answerKey.safeParse(
          data.answerKey,
        );
        if (!answerKey.success) throw new Error('Gabarito VERB_CLOZE invalido.');
        setVerbCorrectForm(answerKey.data.canonical);
        setCheckResult({ isCorrect: data.isCorrect });
      } else {
        // MULTIPLE_CHOICE e TEXT_CHOICE: escolha com letra, mesma montagem de
        // yourAnswer/correctAnswer.
        const payload =
          item.kind === 'TEXT_CHOICE'
            ? EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.payload.parse(item.payload)
            : EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.payload.parse(item.payload);
        const answerKey = item.kind === 'TEXT_CHOICE'
          ? EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.answerKey.safeParse(data.answerKey)
          : EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.answerKey.safeParse(data.answerKey);
        if (!answerKey.success) throw new Error('Gabarito de escolha invalido.');
        const selectedIndex = OPTION_LETTERS.indexOf(selected as OptionLetter);
        const correctIndex = answerKey.data.correctIndex;
        const correctAnswer =
          typeof correctIndex === 'number' && OPTION_LETTERS[correctIndex] !== undefined
            ? { letter: OPTION_LETTERS[correctIndex], text: payload.options[correctIndex] }
            : undefined;

        setCheckResult({
          isCorrect: data.isCorrect,
          yourAnswer: { letter: selected as string, text: payload.options[selectedIndex] },
          correctAnswer,
        });
      }
      setAnsweredCount(data.answeredCount);
      setHits(data.correctCount);
      setCheckState('idle');
      setPhase('checked');
    } catch {
      // Erro de rede/5xx: a selecao fica intacta e o aluno tenta de novo.
      setCheckState('error');
    } finally {
      checkInFlightRef.current = false;
    }
  }, [attemptItems, index, attemptId, phase, checkState, selected, matchPairs, verbAnswer, exercise.id]);

  const handleNext = useCallback(async () => {
    setAnnouncement('');
    setCheckResult(null);
    if (index >= attemptItems.length - 1) {
      if (!attemptId || finishState === 'submitting') return;
      setFinishState('submitting');
      try {
        const response = await fetch(API.EXERCISES.ATTEMPT_FINISH(exercise.id, attemptId), {
          method: 'POST',
          credentials: 'include',
        });
        const json = (await response.json().catch(() => null)) as FinishAttemptResponse | null;
        if (!response.ok || json?.data?.status !== 'COMPLETED') {
          throw new Error('Falha ao finalizar tentativa.');
        }
        setFinishState('idle');
        setPhase('finished');
        router.push(ROUTES.EXERCISE_ATTEMPT_SUMMARY(exercise.id, attemptId));
      } catch {
        setFinishState('error');
      }
      return;
    }
    setIndex((current) => current + 1);
    setSelected(null);
    setMatchPairs([]);
    setMatchCorrectPairs(null);
    setVerbAnswer('');
    setVerbCorrectForm(null);
    setPhase('answering');
  }, [attemptId, attemptItems.length, exercise.id, finishState, index, router]);

  const handleRetry = useCallback(async () => {
    if (!attemptId || retryInFlightRef.current) return;

    retryInFlightRef.current = true;
    setRetryState('submitting');

    try {
      // Uma tentativa ainda aberta precisa ser abandonada antes que o POST
      // canonico possa criar outra. Se o POST falhar depois do abandono, o id
      // fica marcado para o retry transitorio nao tentar abandona-lo de novo.
      if (phase !== 'finished' && abandonedForRetryRef.current !== attemptId) {
        const abandonResponse = await fetch(API.EXERCISES.ATTEMPT(attemptId), {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'abandon' }),
        });
        if (!abandonResponse.ok) throw new Error('Falha ao abandonar tentativa atual.');
        abandonedForRetryRef.current = attemptId;
      }

      const response = await fetch(API.EXERCISES.ATTEMPTS(exercise.id), {
        method: 'POST',
        credentials: 'include',
      });
      const json = (await response.json().catch(() => null)) as AttemptStartResponse | null;
      const attempt = json?.data?.attempt;
      if (!response.ok || !attempt) throw new Error('Falha ao iniciar nova tentativa.');

      setAttemptId(attempt.id);
      setAttemptItemCount(attempt.itemCount);
      setAnsweredCount(attempt.answeredCount);
      setHits(attempt.correctCount);

      const answeredIds = new Set(attempt.answeredItemIds ?? []);
      const firstUnanswered = answeredIds.size > 0
        ? items.slice(0, attempt.itemCount).findIndex((item) => !answeredIds.has(item.id))
        : -1;
      const fallbackIndex = Math.min(
        attempt.answeredCount,
        Math.max(Math.min(attempt.itemCount, items.length) - 1, 0),
      );
      setIndex(firstUnanswered >= 0 ? firstUnanswered : fallbackIndex);
      setSelected(null);
      setMatchPairs([]);
      setMatchCorrectPairs(null);
      setVerbAnswer('');
      setVerbCorrectForm(null);
      setPhase('answering');
      setMissingSelection(false);
      setCheckState('idle');
      setCheckResult(null);
      setFinishState('idle');
      setRetryState('idle');
      setAnnouncement(t('restarted'));
      abandonedForRetryRef.current = null;
      router.push(ROUTES.EXERCISE(exercise.id));
    } catch {
      setRetryState('error');
    } finally {
      retryInFlightRef.current = false;
    }
  }, [attemptId, exercise.id, items, phase, router, t]);

  const handleClose = useCallback(async () => {
    if (closeState === 'submitting') return;
    setCloseState('submitting');
    try {
      const response = await persistOpenAttempt();
      if (response && !response.ok) throw new Error('Falha ao persistir tentativa.');
      router.push(ROUTES.EXERCISES);
    } catch {
      setCloseState('error');
    }
  }, [closeState, persistOpenAttempt, router]);

  /**
   * Renderer do item corrente, discriminado por `kind`. Tipos novos entram
   * como casos novos; o ramo `default` marcado `never` faz `tsc` reprovar um
   * kind adicionado ao enum sem tratamento aqui.
   */
  function renderItem(item: DrillItem) {
    switch (item.kind) {
      case 'MULTIPLE_CHOICE': {
        const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.payload.parse(item.payload);
        return (
          <AnswerChoices
            questionId={item.id}
            prompt={payload.prompt}
            options={payload.options.map((text, optionIndex) => ({
              letter: OPTION_LETTERS[optionIndex],
              text,
            }))}
            selected={selected}
            phase={phase === 'checked' ? 'checked' : 'answering'}
            correctLetter={checkResult?.correctAnswer?.letter}
            onSelect={handleSelect}
          />
        );
      }
      case 'MATCH_CLICK': {
        const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.payload.parse(item.payload);
        return (
          <MatchColumns
            key={item.id}
            left={payload.left}
            right={payload.right}
            pairs={matchPairs}
            phase={phase === 'checked' ? 'checked' : 'answering'}
            correctPairs={matchCorrectPairs ?? undefined}
            onPairsChange={handlePairsChange}
            onValidatePair={handleValidateMatchPair}
          />
        );
      }
      case 'TEXT_CHOICE': {
        const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.payload.parse(item.payload);
        return (
          <div>
            <div
              data-testid="reading-text"
              className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground"
            >
              {payload.readingText}
            </div>
            <AnswerChoices
              questionId={item.id}
              prompt={payload.prompt}
              options={payload.options.map((text, optionIndex) => ({
                letter: OPTION_LETTERS[optionIndex],
                text,
              }))}
              selected={selected}
              phase={phase === 'checked' ? 'checked' : 'answering'}
              correctLetter={checkResult?.correctAnswer?.letter}
              onSelect={handleSelect}
            />
          </div>
        );
      }
      case 'VERB_CLOZE': {
        const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.payload.parse(item.payload);
        return (
          <ClozeText
            infinitive={payload.infinitive}
            tenseLabel={t('verbTensePresenteIndicativo')}
            sentence={payload.sentence}
            value={verbAnswer}
            phase={phase === 'checked' ? 'checked' : 'answering'}
            isCorrect={checkResult?.isCorrect}
            correctForm={verbCorrectForm ?? undefined}
            onChange={handleVerbChange}
            onSubmit={() => void handleCheck()}
          />
        );
      }
      case 'AUDIO_WORD':
      case 'AUDIO_CLOZE':
      case 'AUDIO_SENTENCE':
      case 'AUDIO_CHOICE':
      case 'AUDIO_ORDER':
      case 'IMAGE_WORD':
      case 'IMAGE_CHOICE':
      case 'IMAGE_SPEAK':
      case 'AUDIO_SHADOW':
      case 'L1_SPEAK_PT':
        throw new Error(`Tipo de item ainda nao jogavel na tentativa: ${item.kind}`);
      default: {
        const exhaustive: never = item.kind;
        throw new Error(`Tipo de item desconhecido: ${String(exhaustive)}`);
      }
    }
  }

  // Zero Estados Indefinidos: exercicio publicado sem itens renderiza um estado
  // legivel. O admin ja barra esse caso na publicacao; este ramo e a rede de
  // seguranca, espelhando o card estatico.
  if (total === 0) {
    return (
      <div data-testid="drill-shell" className="flex min-h-dvh flex-col bg-background">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">{t('emptyExercise')}</p>
            <Button
              data-testid="drill-close-button"
              variant="outline"
              className="mt-4 min-h-11 min-w-11"
              onClick={() => void handleClose()}
            >
              {t('backToExercises')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentItem = attemptItems[index];
  const isLastQuestion = index === attemptItems.length - 1;
  const progressAnswered = Math.min(answeredCount, total);
  const progressPercent = total > 0 ? Math.round((progressAnswered / total) * 100) : 0;
  const progressText =
    phase === 'finished' ? t('progressDone', { total }) : t('progress', { current: index + 1, total });

  return (
    <div data-testid="drill-shell" className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Button
            data-testid="drill-close-button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => void handleClose()}
            aria-busy={closeState === 'submitting'}
            aria-label={t('closeDrill')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {exercise.title}
          </h1>
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 pb-3">
          <Progress value={progressPercent} aria-label={progressText}>
            <p className="w-full text-xs font-medium text-muted-foreground">{progressText}</p>
          </Progress>
        </div>
      </header>

      <div className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          {startState === 'starting' && (
            <div
              data-testid="drill-starting"
              role="status"
              className="flex items-center justify-center py-16"
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          {startState === 'error' && (
            <div
              data-testid="drill-start-error"
              className="rounded-2xl border border-border bg-card p-8 text-center"
            >
              <CircleAlert
                className="mx-auto h-8 w-8 text-destructive"
                aria-hidden="true"
              />
              <p className="mt-3 text-base font-semibold text-foreground">{t('errorTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('errorDescription')}</p>
              <Button
                data-testid="drill-start-retry-button"
                size="lg"
                className="mt-6 min-h-11 min-w-11"
                onClick={() => void startAttempt()}
              >
                {t('errorRetry')}
              </Button>
            </div>
          )}

          {startState === 'ready' &&
            (phase === 'finished' ? (
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
              currentItem && renderItem(currentItem)
            ))}
        </div>
      </div>

      {startState === 'ready' && (
        <footer className="sticky bottom-0 border-t border-border bg-background">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            {missingSelection && (
              <p
                data-testid="exercise-warning"
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {currentItem?.kind === 'MATCH_CLICK'
                  ? t('matchIncompleteWarning')
                  : currentItem?.kind === 'VERB_CLOZE'
                    ? t('verbClozeEmptyWarning')
                    : t('noSelectionWarning')}
              </p>
            )}

            {(checkState === 'error' || finishState === 'error' || closeState === 'error') && (
              <p
                data-testid="exercise-check-error"
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('checkError')}
              </p>
            )}

            {retryState === 'error' && (
              <p
                data-testid="exercise-retry-error"
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('summaryRetryError')}
              </p>
            )}

            {phase === 'checked' && checkResult && (
              <AnswerResultBar
                isCorrect={checkResult.isCorrect}
                yourAnswer={!checkResult.isCorrect ? checkResult.yourAnswer : undefined}
                correctAnswer={checkResult.correctAnswer}
              />
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {phase === 'answering' && (
                <Button
                  data-testid="exercise-check-button"
                  size="lg"
                  className="min-h-11 min-w-11"
                  onClick={() => void handleCheck()}
                  aria-busy={checkState === 'submitting'}
                  disabled={checkState === 'submitting'}
                >
                  {checkState === 'submitting' && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {t('checkButton')}
                </Button>
              )}

              {phase === 'checked' && (
                <Button
                  data-testid="exercise-next-button"
                  size="lg"
                  className="min-h-11 min-w-11"
                  onClick={() => void handleNext()}
                  aria-busy={finishState === 'submitting'}
                  disabled={finishState === 'submitting'}
                >
                  {finishState === 'submitting' && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {isLastQuestion ? t('finishButton') : t('nextButton')}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}

              <Button
                data-testid="exercise-retry-button"
                size="lg"
                className="min-h-11 min-w-11"
                variant={phase === 'finished' ? 'default' : 'outline'}
                onClick={() => void handleRetry()}
                aria-busy={retryState === 'submitting'}
                disabled={
                  retryState === 'submitting' ||
                  checkState === 'submitting' ||
                  finishState === 'submitting'
                }
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t('retryButton')}
              </Button>
            </div>
          </div>
        </footer>
      )}

      {/* Retorno falado do "refazer": a tela volta ao inicio sem mudanca
          visivel de layout, entao o anuncio e o unico sinal para leitor de
          tela. */}
      <p data-testid="exercise-announcement" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
