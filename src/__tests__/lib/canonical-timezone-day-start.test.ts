// @vitest-environment node
/**
 * GAP-09 — inicio do dia civil no fuso canonico.
 * Import por namespace de proposito: sem o export, cada `it` falha com
 * `is not a function` em vez de derrubar o arquivo inteiro.
 */
import { describe, it, expect } from 'vitest';
import * as janela from '@/lib/canonical-timezone-window';

/** Chave local `AAAA-MM-DD HH:mm` do instante no fuso, sem passar por `civilDayStart`. */
function chaveLocal(instante: string, timeZone: string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instante))
      .map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}

describe('civilDayStart() no fuso canonico (GAP-09)', () => {
  // Premissa de tzdata: falha aqui e ambiente do executor, nunca defeito do produto
  it('[CONTROLE tz] deve reconhecer no runtime as trocas de horario usadas pelos casos', () => {
    expect(chaveLocal('2017-09-30T14:00:00Z', 'Australia/Sydney')).toBe('2017-10-01 00:00');
    expect(chaveLocal('2017-09-30T13:59:00Z', 'Australia/Sydney')).toBe('2017-09-30 23:59');
    expect(chaveLocal('2018-03-31T11:00:00Z', 'Pacific/Auckland')).toBe('2018-04-01 00:00');
    expect(chaveLocal('2018-03-31T10:59:00Z', 'Pacific/Auckland')).toBe('2018-03-31 23:59');
    expect(chaveLocal('2016-03-31T22:00:00Z', 'Asia/Amman')).toBe('2016-04-01 01:00');
    expect(chaveLocal('2016-03-31T21:59:00Z', 'Asia/Amman')).toBe('2016-03-31 23:59');
  });

  it('[RED d1] deve comecar 01/10/2017 na meia-noite de UTC+10 em Australia/Sydney, antes da troca para UTC+11', () => {
    expect(janela.civilDayStart('2017-10-01', 'Australia/Sydney').toISOString()).toBe('2017-09-30T14:00:00.000Z');
  });

  it('[RED d2] deve comecar 01/04/2018 na meia-noite de UTC+13 em Pacific/Auckland, antes da troca para UTC+12', () => {
    expect(janela.civilDayStart('2018-04-01', 'Pacific/Auckland').toISOString()).toBe('2018-03-31T11:00:00.000Z');
  });

  it('[RED d3] deve comecar 01/04/2016 as 01:00 local em Asia/Amman, onde a meia-noite nao existe', () => {
    expect(janela.civilDayStart('2016-04-01', 'Asia/Amman').toISOString()).toBe('2016-03-31T22:00:00.000Z');
  });

  it('[CONTROLE d4] deve ficar com a primeira ocorrencia da meia-noite repetida em America/Havana', () => {
    expect(janela.civilDayStart('2020-11-01', 'America/Havana').toISOString()).toBe('2020-11-01T04:00:00.000Z');
  });

  it('[CONTROLE d5] deve comecar 01/10/2023 as 01:00 local em America/Asuncion, onde a meia-noite nao existe', () => {
    expect(janela.civilDayStart('2023-10-01', 'America/Asuncion').toISOString()).toBe('2023-10-01T04:00:00.000Z');
  });

  it('[RED d6] deve lancar RangeError para dia civil malformado e para fuso inexistente', () => {
    expect(() => janela.civilDayStart('2026-4-1', 'America/Sao_Paulo')).toThrow(RangeError);
    expect(() => janela.civilDayStart('2026-04-01', 'Fuso/Inexistente')).toThrow(RangeError);
  });
});
