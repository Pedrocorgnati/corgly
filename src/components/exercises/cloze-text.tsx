'use client';

/**
 * Bloco de lacuna verbal do tipo VERB_CLOZE (item 010).
 *
 * Nome: `ClozeText` e contrato. O termo "lacuna" fica reservado ao espaco da
 * frase marcado por `VERB_CLOZE_MARKER` (`{{verbo}}`, exatamente uma
 * ocorrencia por frase, garantido pelo `verbClozePayloadSchema`).
 *
 * Componente CONTROLADO: o texto digitado mora no `DrillShell` (`verbAnswer`),
 * porque e o shell que confere (mesma razao de `selected` e de `matchPairs`,
 * D-009-5/D-010-4). O bloco nao conhece o veredito alem das props
 * `isCorrect`/`correctForm`.
 *
 * Chips informativos acima da frase (nao clicaveis): o chip do verbo mostra o
 * `infinitive` do payload (conteudo PT, sem chave i18n); o chip do tempo
 * mostra `tenseLabel`, rotulo de interface que chega pronto por chave i18n do
 * shell (D-010-5 — o aluno e localized nos quatro locales, nao consome o
 * `VERB_TENSE_LABELS` do admin, que e PT-BR fixo).
 *
 * Enter envia na fase `answering` (secao 6.3); o input e elemento nativo do
 * kit com alvo de toque `min-h-11` (44 px). A frase e texto puro — nenhum
 * HTML injetado, nenhum Markdown (mesma decisao de seguranca da 10.3.1).
 *
 * Estados visuais por token, icone e texto, nunca cor sozinha e nunca
 * animacao (tabela 9.2): na fase `checked` o input fica desabilitado com o
 * valor digitado preservado; acerto usa `border-success bg-success/10` +
 * CheckCircle2, erro usa `border-destructive bg-destructive/10` + XCircle e a
 * forma canonica (`correctForm`) aparece junto da lacuna com o token de certo
 * — o gabarito esta sempre na tela (D-010-2, mesmo contrato do
 * `MatchColumns`).
 */

import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { VERB_CLOZE_MARKER } from '@/lib/exercises/exercise-item.schema';

interface ClozeTextProps {
  infinitive: string;
  tenseLabel: string;
  sentence: string;
  value: string;
  phase: 'answering' | 'checked';
  isCorrect?: boolean;
  correctForm?: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}

export function ClozeText({
  infinitive,
  tenseLabel,
  sentence,
  value,
  phase,
  isCorrect,
  correctForm,
  onChange,
  onSubmit,
}: ClozeTextProps) {
  const t = useTranslations('exercises');

  // O schema garante exatamente um marcador: prefixo e sufixo sao texto puro.
  const [prefix, suffix] = sentence.split(VERB_CLOZE_MARKER);

  const checkedCorrect = phase === 'checked' && isCorrect === true;
  const checkedWrong = phase === 'checked' && isCorrect === false;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && phase === 'answering') {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div data-testid="cloze-text">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          data-testid="cloze-verb-chip"
          className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          {infinitive}
        </span>
        <span
          data-testid="cloze-tense-chip"
          className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          {tenseLabel}
        </span>
      </div>

      <p className="text-base leading-relaxed text-foreground">
        <span>{prefix}</span>
        <span className="relative mx-1 inline-block align-middle">
          <Input
            data-testid="cloze-input"
            value={value}
            disabled={phase === 'checked'}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={t('verbClozeInputLabel')}
            autoComplete="off"
            autoCapitalize="none"
            className={cn(
              'min-h-11 w-40',
              phase === 'answering' && 'border-input',
              checkedCorrect && 'border-success bg-success/10 pr-9',
              checkedWrong && 'border-destructive bg-destructive/10 pr-9'
            )}
          />
          {checkedCorrect && (
            <CheckCircle2
              className="pointer-events-none absolute top-1/2 right-2.5 h-5 w-5 -translate-y-1/2 text-success"
              aria-hidden="true"
            />
          )}
          {checkedWrong && (
            <XCircle
              className="pointer-events-none absolute top-1/2 right-2.5 h-5 w-5 -translate-y-1/2 text-destructive"
              aria-hidden="true"
            />
          )}
        </span>
        <span>{suffix}</span>
      </p>

      {checkedWrong && correctForm !== undefined && (
        <p
          data-testid="cloze-correct-form"
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-success bg-success/10 p-3 text-sm text-foreground"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>{correctForm}</span>
        </p>
      )}
    </div>
  );
}
