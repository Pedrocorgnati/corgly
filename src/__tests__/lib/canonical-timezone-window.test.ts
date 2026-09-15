/**
 * GAP-08 - janela civil semiaberta [inicio, fim) de um mes num fuso IANA.
 *
 * O calendario do aluno e o do professor pediam o mes em dias UTC: em Sao Paulo
 * o ultimo dia do mes perdia os horarios depois das 21h locais, e em Kiritimati
 * o primeiro dia do mes nem entrava na busca. O modulo novo calcula o inicio e o
 * fim do mes no fuso recebido e a cobertura UTC em dias inteiros que a rota
 * espera (`until` exclusivo).
 *
 * H9-H24 dependem do tzdata do ICU do node do workspace: se um offset mudar, e
 * premissa quebrada, nunca troca de ISO esperado sem registro.
 */
import { describe, expect, it } from 'vitest';

import {
  civilMonthWindow,
  isInCivilWindow,
  isValidCivilDateKey,
  type CivilMonthWindow,
} from '@/lib/canonical-timezone-window';

function emTexto(janela: CivilMonthWindow) {
  return {
    start: janela.start.toISOString(),
    end: janela.end.toISOString(),
    date: janela.date,
    until: janela.until,
  };
}

describe('civilMonthWindow - mes civil no fuso IANA (GAP-08)', () => {
  it('RED: H1 Sao Paulo 2026-09 comeca e termina as 03:00Z e cobre ate 2026-10-02 exclusivo', () => {
    expect(emTexto(civilMonthWindow('2026-09', 'America/Sao_Paulo'))).toEqual({
      start: '2026-09-01T03:00:00.000Z',
      end: '2026-10-01T03:00:00.000Z',
      date: '2026-09-01',
      until: '2026-10-02',
    });
  });

  it('RED: H2 Kiritimati 2027-01 comeca no dia UTC anterior', () => {
    const janela = civilMonthWindow('2027-01', 'Pacific/Kiritimati');
    expect(janela.start.toISOString()).toBe('2026-12-31T10:00:00.000Z');
    expect(janela.date).toBe('2026-12-31');
    expect(janela.until).toBe('2027-02-01');
  });

  it('RED: H3 Pago_Pago 2026-09 comeca as 11:00Z', () => {
    const janela = civilMonthWindow('2026-09', 'Pacific/Pago_Pago');
    expect(janela.start.toISOString()).toBe('2026-09-01T11:00:00.000Z');
    expect(janela.date).toBe('2026-09-01');
    expect(janela.until).toBe('2026-10-02');
  });

  it('RED: H4 UTC 2026-12 cobre exatamente o mes, com until no dia 1 seguinte', () => {
    const janela = civilMonthWindow('2026-12', 'UTC');
    expect(janela.date).toBe('2026-12-01');
    expect(janela.until).toBe('2027-01-01');
  });

  it('RED: H5 isInCivilWindow e semiaberta e rejeita instante ilegivel', () => {
    const janela = civilMonthWindow('2026-09', 'America/Sao_Paulo');
    expect(isInCivilWindow(janela.start.toISOString(), janela)).toBe(true);
    expect(isInCivilWindow(new Date(janela.end.getTime() - 1).toISOString(), janela)).toBe(true);
    expect(isInCivilWindow(janela.end.toISOString(), janela)).toBe(false);
    expect(isInCivilWindow(new Date(janela.start.getTime() - 1).toISOString(), janela)).toBe(false);
    expect(isInCivilWindow('nao-e-data', janela)).toBe(false);
  });

  it('RED: H6 isValidCivilDateKey aceita so dia que existe no calendario', () => {
    for (const invalida of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-9-01', '2027-02-29']) {
      expect(isValidCivilDateKey(invalida)).toBe(false);
    }
    expect(isValidCivilDateKey(null)).toBe(false);
    expect(isValidCivilDateKey('2028-02-29')).toBe(true);
    expect(isValidCivilDateKey('2026-09-01')).toBe(true);
  });

  it('RED: H7 fuso IANA inexistente lanca RangeError', () => {
    expect(() => civilMonthWindow('2026-09', 'Fuso/Inexistente')).toThrow(RangeError);
  });

  it('RED: H8 mes fora do formato YYYY-MM lanca RangeError', () => {
    expect(() => civilMonthWindow('2026-13', 'UTC')).toThrow(RangeError);
    expect(() => civilMonthWindow('2026-9', 'UTC')).toThrow(RangeError);
  });
});

describe('civilMonthWindow - bordas de horario de verao (GAP-08)', () => {
  it('RED: H9 Sydney 2017-10, horario de verao comeca no dia 1', () => {
    // sonda unica daria start = 2017-09-30T13:00:00.000Z
    expect(emTexto(civilMonthWindow('2017-10', 'Australia/Sydney'))).toEqual({
      start: '2017-09-30T14:00:00.000Z',
      end: '2017-10-31T13:00:00.000Z',
      date: '2017-09-30',
      until: '2017-11-01',
    });
  });

  it('RED: H10 Sydney 2017-09 termina antes do salto do dia 1 seguinte', () => {
    // sonda unica daria end = 2017-09-30T13:00:00.000Z
    expect(emTexto(civilMonthWindow('2017-09', 'Australia/Sydney'))).toEqual({
      start: '2017-08-31T14:00:00.000Z',
      end: '2017-09-30T14:00:00.000Z',
      date: '2017-08-31',
      until: '2017-10-01',
    });
  });

  it('RED: H11 Auckland 2018-04, horario de verao termina no dia 1', () => {
    // sonda unica daria start = 2018-03-31T12:00:00.000Z
    expect(emTexto(civilMonthWindow('2018-04', 'Pacific/Auckland'))).toEqual({
      start: '2018-03-31T11:00:00.000Z',
      end: '2018-04-30T12:00:00.000Z',
      date: '2018-03-31',
      until: '2018-05-01',
    });
  });

  it('RED: H12 Auckland 2018-03 termina com o offset de verao', () => {
    // sonda unica daria end = 2018-03-31T12:00:00.000Z
    expect(emTexto(civilMonthWindow('2018-03', 'Pacific/Auckland'))).toEqual({
      start: '2018-02-28T11:00:00.000Z',
      end: '2018-03-31T11:00:00.000Z',
      date: '2018-02-28',
      until: '2018-04-01',
    });
  });

  it('RED: H13 Adelaide 2017-10, offset de meia hora', () => {
    // sonda unica daria start = 2017-09-30T13:30:00.000Z
    expect(emTexto(civilMonthWindow('2017-10', 'Australia/Adelaide'))).toEqual({
      start: '2017-09-30T14:30:00.000Z',
      end: '2017-10-31T13:30:00.000Z',
      date: '2017-09-30',
      until: '2017-11-01',
    });
  });

  it('RED: H14 Lord_Howe 2017-10, salto de 30 min', () => {
    // sonda unica daria start = 2017-09-30T13:00:00.000Z
    expect(emTexto(civilMonthWindow('2017-10', 'Australia/Lord_Howe'))).toEqual({
      start: '2017-09-30T13:30:00.000Z',
      end: '2017-10-31T13:00:00.000Z',
      date: '2017-09-30',
      until: '2017-11-01',
    });
  });

  it('RED: H15 Lord_Howe 2018-04, recuo de 30 min', () => {
    // sonda unica daria start = 2018-03-31T13:30:00.000Z
    expect(emTexto(civilMonthWindow('2018-04', 'Australia/Lord_Howe'))).toEqual({
      start: '2018-03-31T13:00:00.000Z',
      end: '2018-04-30T13:30:00.000Z',
      date: '2018-03-31',
      until: '2018-05-01',
    });
  });

  it('RED: H16 Amman 2016-04, meia-noite do dia 1 inexistente', () => {
    // sonda unica daria start = 2016-03-31T21:00:00.000Z
    expect(emTexto(civilMonthWindow('2016-04', 'Asia/Amman'))).toEqual({
      start: '2016-03-31T22:00:00.000Z',
      end: '2016-04-30T21:00:00.000Z',
      date: '2016-03-31',
      until: '2016-05-01',
    });
  });

  it('RED: H17 Amman 2016-03 termina no primeiro instante valido de abril', () => {
    // sonda unica daria end = 2016-03-31T21:00:00.000Z
    expect(emTexto(civilMonthWindow('2016-03', 'Asia/Amman'))).toEqual({
      start: '2016-02-29T22:00:00.000Z',
      end: '2016-03-31T22:00:00.000Z',
      date: '2016-02-29',
      until: '2016-04-01',
    });
  });

  it('RED: H18 Asuncion 2023-10, meia-noite do dia 1 inexistente', () => {
    // controle da regra, sonda unica daria o mesmo valor
    expect(emTexto(civilMonthWindow('2023-10', 'America/Asuncion'))).toEqual({
      start: '2023-10-01T04:00:00.000Z',
      end: '2023-11-01T03:00:00.000Z',
      date: '2023-10-01',
      until: '2023-11-02',
    });
  });

  it('RED: H19 Havana 2020-11, meia-noite do dia 1 repetida fica com a primeira ocorrencia', () => {
    // controle da primeira ocorrencia, sonda unica daria o mesmo valor
    expect(emTexto(civilMonthWindow('2020-11', 'America/Havana'))).toEqual({
      start: '2020-11-01T04:00:00.000Z',
      end: '2020-12-01T05:00:00.000Z',
      date: '2020-11-01',
      until: '2020-12-02',
    });
  });

  it('RED: H20 Havana 2020-10 termina na primeira ocorrencia da meia-noite de novembro', () => {
    // sonda unica daria o mesmo valor
    expect(emTexto(civilMonthWindow('2020-10', 'America/Havana'))).toEqual({
      start: '2020-10-01T04:00:00.000Z',
      end: '2020-11-01T04:00:00.000Z',
      date: '2020-10-01',
      until: '2020-11-02',
    });
  });

  it('RED: H21 Auckland, 2018-03-31T11:30Z pertence a abril e nao a marco', () => {
    const instante = '2018-03-31T11:30:00.000Z';
    expect(isInCivilWindow(instante, civilMonthWindow('2018-04', 'Pacific/Auckland'))).toBe(true);
    expect(isInCivilWindow(instante, civilMonthWindow('2018-03', 'Pacific/Auckland'))).toBe(false);
  });

  it('RED: H22 Sydney, 2017-09-30T13:30Z pertence a setembro e nao a outubro', () => {
    const instante = '2017-09-30T13:30:00.000Z';
    expect(isInCivilWindow(instante, civilMonthWindow('2017-09', 'Australia/Sydney'))).toBe(true);
    expect(isInCivilWindow(instante, civilMonthWindow('2017-10', 'Australia/Sydney'))).toBe(false);
  });

  it('RED: H23 Amman, 2016-03-31T21:30Z pertence a marco e nao a abril', () => {
    const instante = '2016-03-31T21:30:00.000Z';
    expect(isInCivilWindow(instante, civilMonthWindow('2016-03', 'Asia/Amman'))).toBe(true);
    expect(isInCivilWindow(instante, civilMonthWindow('2016-04', 'Asia/Amman'))).toBe(false);
  });

  it('RED: H24 Havana, as duas meias-noites repetidas pertencem a novembro', () => {
    const novembro = civilMonthWindow('2020-11', 'America/Havana');
    const outubro = civilMonthWindow('2020-10', 'America/Havana');
    for (const instante of ['2020-11-01T04:30:00.000Z', '2020-11-01T05:30:00.000Z']) {
      expect(isInCivilWindow(instante, novembro)).toBe(true);
      expect(isInCivilWindow(instante, outubro)).toBe(false);
    }
  });
});
