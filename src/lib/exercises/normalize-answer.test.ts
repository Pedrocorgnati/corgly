import { describe, expect, it } from 'vitest';
import { matchesAnswerKey, normalizeAnswer } from './normalize-answer';

const WITH_ACCENT = { acceptWithoutAccent: false } as const;
const WITHOUT_ACCENT = { acceptWithoutAccent: true } as const;

describe('normalizeAnswer', () => {
  it('remove espaco de borda e colapsa espaco interno', () => {
    expect(normalizeAnswer('  falo   portugues  ', WITH_ACCENT)).toBe('falo portugues');
  });

  it('baixa a caixa', () => {
    expect(normalizeAnswer('Falo', WITH_ACCENT)).toBe('falo');
  });

  it('descarta pontuacao', () => {
    expect(normalizeAnswer('falo, portugues!', WITH_ACCENT)).toBe('falo portugues');
  });

  it('preserva acento quando acceptWithoutAccent e false', () => {
    expect(normalizeAnswer('está', WITH_ACCENT)).toBe('está');
  });

  it('remove acento quando acceptWithoutAccent e true', () => {
    expect(normalizeAnswer('está', WITHOUT_ACCENT)).toBe('esta');
  });

  it('remove acento de cedilha e til juntos', () => {
    expect(normalizeAnswer('Ação Não', WITHOUT_ACCENT)).toBe('acao nao');
  });

  it('devolve string vazia para entrada so de espaco', () => {
    expect(normalizeAnswer('   ', WITH_ACCENT)).toBe('');
  });

  it('nao junta palavras ao trocar pontuacao por espaco', () => {
    expect(normalizeAnswer('eu-falo', WITH_ACCENT)).toBe('eu falo');
  });
});

describe('matchesAnswerKey', () => {
  const key = { canonical: 'está', accepted: ['esta agora'] };

  it('bate com a forma canonica exata', () => {
    expect(matchesAnswerKey('está', key, WITH_ACCENT)).toBe(true);
  });

  it('bate com a canonica ignorando caixa, espaco e pontuacao', () => {
    expect(matchesAnswerKey('  Está.  ', key, WITH_ACCENT)).toBe(true);
  });

  it('recusa forma sem acento quando o item exige acento', () => {
    expect(matchesAnswerKey('esta', key, WITH_ACCENT)).toBe(false);
  });

  it('aceita forma sem acento quando o item permite', () => {
    expect(matchesAnswerKey('esta', key, WITHOUT_ACCENT)).toBe(true);
  });

  it('bate com variante de accepted', () => {
    expect(matchesAnswerKey('Esta agora!', key, WITHOUT_ACCENT)).toBe(true);
  });

  it('recusa resposta vazia mesmo com gabarito vazio', () => {
    expect(matchesAnswerKey('   ', { canonical: '' }, WITH_ACCENT)).toBe(false);
  });

  it('funciona sem accepted declarado', () => {
    expect(matchesAnswerKey('falo', { canonical: 'falo' }, WITH_ACCENT)).toBe(true);
    expect(matchesAnswerKey('falas', { canonical: 'falo' }, WITH_ACCENT)).toBe(false);
  });
});
