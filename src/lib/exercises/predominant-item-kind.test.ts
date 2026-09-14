// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { getPredominantItemKind } from './predominant-item-kind';

describe('getPredominantItemKind', () => {
  it('retorna null quando o exercicio nao tem itens', () => {
    expect(getPredominantItemKind([])).toBeNull();
  });

  it('retorna o tipo com maior frequencia', () => {
    expect(
      getPredominantItemKind([
        { kind: 'TEXT_CHOICE', position: 1 },
        { kind: 'MATCH_CLICK', position: 2 },
        { kind: 'TEXT_CHOICE', position: 3 },
      ]),
    ).toBe('TEXT_CHOICE');
  });

  it('desempata pela menor position mesmo quando o input esta fora de ordem', () => {
    expect(
      getPredominantItemKind([
        { kind: 'TEXT_CHOICE', position: 8 },
        { kind: 'MATCH_CLICK', position: 10 },
        { kind: 'TEXT_CHOICE', position: 4 },
        { kind: 'MATCH_CLICK', position: 1 },
      ]),
    ).toBe('MATCH_CLICK');
  });

  it.each([
    ['MULTIPLE_CHOICE', 'MATCH_CLICK'],
    ['MATCH_CLICK', 'TEXT_CHOICE'],
    ['TEXT_CHOICE', 'VERB_CLOZE'],
  ] as const)(
    'desempata %s antes de %s pela prioridade canonica da Fase 1',
    (expected, other) => {
      expect(
        getPredominantItemKind([
          { kind: other, position: 1 },
          { kind: expected, position: 1 },
        ]),
      ).toBe(expected);
    },
  );

  it('usa ordem lexical como fallback defensivo fora da Fase 1', () => {
    expect(
      getPredominantItemKind([
        { kind: 'AUDIO_WORD', position: 1 },
        { kind: 'AUDIO_CLOZE', position: 1 },
      ]),
    ).toBe('AUDIO_CLOZE');
  });
});
