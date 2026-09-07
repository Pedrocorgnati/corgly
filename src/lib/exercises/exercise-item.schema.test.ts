// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  EXERCISE_ITEM_KINDS,
  PHASE_1_EXERCISE_ITEM_KINDS,
  exerciseItemContentSchema,
  exerciseItemKindSchema,
  matchClickAnswerKeySchema,
  matchClickPayloadSchema,
  multipleChoicePayloadSchema,
  textChoicePayloadSchema,
  verbClozeAnswerKeySchema,
  verbClozePayloadSchema,
} from './exercise-item.schema';
import { OPTIONS_PER_QUESTION } from './types';

function optionsOfSize(size: number): string[] {
  return Array.from({ length: size }, (_, index) => `Alternativa ${index + 1}`);
}

function matchColumn(prefix: string, size: number): { id: string; text: string }[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    text: `${prefix} texto ${index + 1}`,
  }));
}

function pairsOfSize(size: number): { leftId: string; rightId: string }[] {
  return Array.from({ length: size }, (_, index) => ({
    leftId: `left-${index + 1}`,
    rightId: `right-${index + 1}`,
  }));
}

describe('ontologia de ExerciseItemKind', () => {
  it('mantem os 14 valores na ordem de armazenamento do enum nativo', () => {
    expect(EXERCISE_ITEM_KINDS).toHaveLength(14);
    expect([...EXERCISE_ITEM_KINDS]).toEqual([
      'MULTIPLE_CHOICE',
      'MATCH_CLICK',
      'AUDIO_WORD',
      'AUDIO_CLOZE',
      'AUDIO_SENTENCE',
      'AUDIO_CHOICE',
      'AUDIO_ORDER',
      'TEXT_CHOICE',
      'VERB_CLOZE',
      'IMAGE_WORD',
      'IMAGE_CHOICE',
      'IMAGE_SPEAK',
      'AUDIO_SHADOW',
      'L1_SPEAK_PT',
    ]);
  });

  it('trata a Fase 1 como subconjunto da ontologia', () => {
    expect(PHASE_1_EXERCISE_ITEM_KINDS).toHaveLength(4);
    PHASE_1_EXERCISE_ITEM_KINDS.forEach((kind) => {
      expect(EXERCISE_ITEM_KINDS).toContain(kind);
    });
  });

  it('aceita os 14 valores no schema de enum e rejeita qualquer outro', () => {
    EXERCISE_ITEM_KINDS.forEach((kind) => {
      expect(exerciseItemKindSchema.safeParse(kind).success).toBe(true);
    });
    expect(exerciseItemKindSchema.safeParse('multiple_choice').success).toBe(false);
    expect(exerciseItemKindSchema.safeParse('AUDIO_DITADO').success).toBe(false);
  });
});

describe('MULTIPLE_CHOICE', () => {
  const validPayload = {
    prompt: 'Qual e a forma correta?',
    options: optionsOfSize(OPTIONS_PER_QUESTION),
  };

  it('aceita exatamente OPTIONS_PER_QUESTION alternativas', () => {
    expect(multipleChoicePayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('aceita o item completo com gabarito na ultima posicao valida', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MULTIPLE_CHOICE',
      payload: validPayload,
      answerKey: { correctIndex: OPTIONS_PER_QUESTION - 1 },
    });
    expect(result.success).toBe(true);
  });

  it.each([3, 5])('rejeita %i alternativas (R-MC-01 exige 4)', (size) => {
    const result = multipleChoicePayloadSchema.safeParse({
      prompt: validPayload.prompt,
      options: optionsOfSize(size),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options']);
  });

  it('rejeita alternativa vazia', () => {
    const result = multipleChoicePayloadSchema.safeParse({
      prompt: validPayload.prompt,
      options: ['Uma', '   ', 'Tres', 'Quatro'],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options', 1]);
  });

  it('rejeita alternativa placeholder', () => {
    const result = multipleChoicePayloadSchema.safeParse({
      prompt: validPayload.prompt,
      options: ['Uma', '-', 'Tres', 'Quatro'],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options', 1]);
    expect(result.error?.issues[0]?.code).toBe('custom');
  });

  it('rejeita alternativa duplicada apos trim', () => {
    const result = multipleChoicePayloadSchema.safeParse({
      prompt: validPayload.prompt,
      options: ['Uma', 'Duas', 'Tres', '  Uma  '],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options', 3]);
  });

  it('rejeita enunciado vazio', () => {
    const result = multipleChoicePayloadSchema.safeParse({
      prompt: '   ',
      options: optionsOfSize(OPTIONS_PER_QUESTION),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['prompt']);
  });

  it('rejeita correctIndex negativo e nao inteiro', () => {
    const base = { kind: 'MULTIPLE_CHOICE' as const, payload: validPayload };
    expect(exerciseItemContentSchema.safeParse({ ...base, answerKey: { correctIndex: -1 } }).success).toBe(false);
    expect(exerciseItemContentSchema.safeParse({ ...base, answerKey: { correctIndex: 1.5 } }).success).toBe(false);
  });
});

describe('TEXT_CHOICE', () => {
  const basePayload = {
    readingText: 'Bruno mora no Recife.\nEle treina todos os dias.',
    prompt: 'Onde Bruno mora?',
  };

  it.each([2, 3, 4, 5])('aceita %i alternativas', (size) => {
    const result = textChoicePayloadSchema.safeParse({ ...basePayload, options: optionsOfSize(size) });
    expect(result.success).toBe(true);
  });

  it.each([1, 6])('rejeita %i alternativas', (size) => {
    const result = textChoicePayloadSchema.safeParse({ ...basePayload, options: optionsOfSize(size) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options']);
  });

  it('rejeita bloco de leitura vazio', () => {
    const result = textChoicePayloadSchema.safeParse({
      ...basePayload,
      readingText: '   ',
      options: optionsOfSize(3),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['readingText']);
  });

  it('herda as regras de placeholder e duplicata do conjunto de alternativas', () => {
    const placeholder = textChoicePayloadSchema.safeParse({
      ...basePayload,
      options: ['Recife', '—'],
    });
    expect(placeholder.success).toBe(false);

    const duplicated = textChoicePayloadSchema.safeParse({
      ...basePayload,
      options: ['Recife', 'Recife '],
    });
    expect(duplicated.success).toBe(false);
  });

  it('nao aceita campo de idioma por item (o eixo e Exercise.supportLanguage)', () => {
    const result = textChoicePayloadSchema.safeParse({
      ...basePayload,
      options: optionsOfSize(2),
      language: 'PT_BR',
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('language');
  });
});

describe('VERB_CLOZE', () => {
  const validPayload = {
    infinitive: 'morar',
    tense: 'PRESENTE_INDICATIVO',
    person: 'EU',
    sentence: 'Eu {{verbo}} no Recife.',
  };

  it('aceita a frase com exatamente um marcador', () => {
    expect(verbClozePayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejeita frase sem marcador', () => {
    const result = verbClozePayloadSchema.safeParse({ ...validPayload, sentence: 'Eu moro no Recife.' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['sentence']);
    expect(result.error?.issues[0]?.message).toContain('{{verbo}}');
  });

  it('rejeita frase com dois marcadores', () => {
    const result = verbClozePayloadSchema.safeParse({
      ...validPayload,
      sentence: 'Eu {{verbo}} e voce {{verbo}}.',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['sentence']);
    expect(result.error?.issues[0]?.message).toContain('2 marcadores');
  });

  it('rejeita tempo verbal fora da lista fechada', () => {
    const result = verbClozePayloadSchema.safeParse({ ...validPayload, tense: 'PRETERITO_PERFEITO' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['tense']);
  });

  it('rejeita pessoa fora da lista fechada', () => {
    const result = verbClozePayloadSchema.safeParse({ ...validPayload, person: 'TU' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['person']);
  });

  it('aplica default [] em accepted e aceita variantes distintas', () => {
    const withDefault = verbClozeAnswerKeySchema.safeParse({ canonical: 'moro' });
    expect(withDefault.success).toBe(true);
    expect(withDefault.data?.accepted).toEqual([]);

    const withVariants = verbClozeAnswerKeySchema.safeParse({ canonical: 'moro', accepted: ['Moro', 'mora'] });
    expect(withVariants.success).toBe(true);
  });

  it('rejeita variante duplicada e variante igual a forma canonica', () => {
    const duplicated = verbClozeAnswerKeySchema.safeParse({ canonical: 'moro', accepted: ['mora', 'mora'] });
    expect(duplicated.success).toBe(false);
    expect(duplicated.error?.issues[0]?.path).toEqual(['accepted', 1]);

    const echoesCanonical = verbClozeAnswerKeySchema.safeParse({ canonical: 'moro', accepted: ['moro'] });
    expect(echoesCanonical.success).toBe(false);
    expect(echoesCanonical.error?.issues[0]?.path).toEqual(['accepted', 0]);
  });

  it('nao tem regra cruzada: o answerKey nao referencia o payload', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'VERB_CLOZE',
      payload: validPayload,
      answerKey: { canonical: 'moro', accepted: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe('MATCH_CLICK', () => {
  const validPayload = {
    left: matchColumn('left', 5),
    right: matchColumn('right', 5),
  };

  it.each([3, 5, 8])('aceita %i pares', (size) => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MATCH_CLICK',
      payload: { left: matchColumn('left', size), right: matchColumn('right', size) },
      answerKey: { pairs: pairsOfSize(size) },
    });
    expect(result.success).toBe(true);
  });

  it.each([2, 9])('rejeita %i pares', (size) => {
    const result = matchClickPayloadSchema.safeParse({
      left: matchColumn('left', size),
      right: matchColumn('right', size),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['left']);
  });

  it('rejeita texto duplicado dentro da mesma coluna', () => {
    const left = matchColumn('left', 3);
    left[2] = { id: 'left-3', text: left[0]!.text };
    const result = matchClickPayloadSchema.safeParse({ left, right: matchColumn('right', 3) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['left', 2]);
  });

  it('rejeita id duplicado dentro da mesma coluna', () => {
    const right = matchColumn('right', 3);
    right[2] = { id: 'right-1', text: 'texto distinto' };
    const result = matchClickPayloadSchema.safeParse({ left: matchColumn('left', 3), right });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['right', 2]);
  });

  it('rejeita colunas de tamanhos diferentes', () => {
    const result = matchClickPayloadSchema.safeParse({
      left: matchColumn('left', 4),
      right: matchColumn('right', 3),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['right']);
  });

  it('rejeita gabarito um-para-muitos', () => {
    const pairs = pairsOfSize(3);
    pairs[2] = { leftId: 'left-1', rightId: 'right-3' };
    const result = matchClickAnswerKeySchema.safeParse({ pairs });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['pairs', 2]);
  });

  it('rejeita leftId inexistente no payload', () => {
    const pairs = pairsOfSize(5);
    pairs[0] = { leftId: 'left-99', rightId: 'right-1' };
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MATCH_CLICK',
      payload: validPayload,
      answerKey: { pairs },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answerKey', 'pairs', 0, 'leftId']);
  });

  it('rejeita rightId inexistente no payload', () => {
    const pairs = pairsOfSize(5);
    pairs[4] = { leftId: 'left-5', rightId: 'right-99' };
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MATCH_CLICK',
      payload: validPayload,
      answerKey: { pairs },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answerKey', 'pairs', 4, 'rightId']);
  });

  it('rejeita gabarito com cardinalidade diferente da coluna', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MATCH_CLICK',
      payload: validPayload,
      answerKey: { pairs: pairsOfSize(4) },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answerKey', 'pairs']);
  });
});

describe('regra cruzada payload x answerKey', () => {
  it('reprova correctIndex igual a options.length em MULTIPLE_CHOICE', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'MULTIPLE_CHOICE',
      payload: { prompt: 'Qual?', options: optionsOfSize(OPTIONS_PER_QUESTION) },
      answerKey: { correctIndex: OPTIONS_PER_QUESTION },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answerKey', 'correctIndex']);
  });

  it('reprova correctIndex fora da faixa em TEXT_CHOICE', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'TEXT_CHOICE',
      payload: {
        readingText: 'Bruno mora no Recife.',
        prompt: 'Onde?',
        options: optionsOfSize(2),
      },
      answerKey: { correctIndex: 2 },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answerKey', 'correctIndex']);
  });
});

describe('uniao discriminada', () => {
  it('rejeita kind fora dos 14 da ontologia', () => {
    const result = exerciseItemContentSchema.safeParse({
      kind: 'AUDIO_DITADO',
      payload: { prompt: 'Qual?', options: optionsOfSize(OPTIONS_PER_QUESTION) },
      answerKey: { correctIndex: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejeita kind valido na ontologia porem sem branch na Fase 1', () => {
    const naoImplementados = EXERCISE_ITEM_KINDS.filter(
      (kind) => !PHASE_1_EXERCISE_ITEM_KINDS.some((phase1) => phase1 === kind)
    );
    expect(naoImplementados).toHaveLength(10);

    naoImplementados.forEach((kind) => {
      const result = exerciseItemContentSchema.safeParse({
        kind,
        payload: { prompt: 'Qual?', options: optionsOfSize(OPTIONS_PER_QUESTION) },
        answerKey: { correctIndex: 0 },
      });
      expect(result.success).toBe(false);
    });
  });

  it('nenhum payload da Fase 1 carrega gabarito', () => {
    const multipleChoice = multipleChoicePayloadSchema.safeParse({
      prompt: 'Qual?',
      options: optionsOfSize(OPTIONS_PER_QUESTION),
      correctIndex: 0,
    });
    expect(multipleChoice.success).toBe(true);
    expect(multipleChoice.data).not.toHaveProperty('correctIndex');

    const matchClick = matchClickPayloadSchema.safeParse({
      left: matchColumn('left', 3),
      right: matchColumn('right', 3),
      pairs: pairsOfSize(3),
    });
    expect(matchClick.success).toBe(true);
    expect(matchClick.data).not.toHaveProperty('pairs');
  });
});
