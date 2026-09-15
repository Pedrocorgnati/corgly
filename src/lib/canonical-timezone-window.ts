/** Janela civil semiaberta [start, end) e a cobertura UTC em dias inteiros para a rota. */
export interface CivilMonthWindow {
  start: Date;
  end: Date;
  date: string;
  until: string;
}

interface PartesLocais {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const UM_DIA_MS = 86_400_000;
const UMA_HORA_MS = 3_600_000;
const SONDAS_HORAS = [-36, -24, -12, 0, 12, 24, 36];

/** `YYYY-MM-DD` que existe no calendario (rejeita 2026-02-30, 2026-13-01, 2027-02-29). */
export function isValidCivilDateKey(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !DIA_CIVIL.test(value)) return false;
  const instante = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === value;
}

function partesLocais(fmt: Intl.DateTimeFormat, ms: number): PartesLocais {
  const p: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
  };
}

const dois = (n: number): string => String(n).padStart(2, '0');

/** Partes locais em `AAAA-MM-DDTHH:mm:ss`: com largura fixa, a ordem da string e a ordem civil. */
function chaveLocal(fmt: Intl.DateTimeFormat, ms: number): string {
  const p = partesLocais(fmt, ms);
  return `${String(p.y).padStart(4, '0')}-${dois(p.m)}-${dois(p.d)}T${dois(p.h)}:${dois(p.min)}:${dois(p.s)}`;
}

/** Hora local menos UTC no instante `ms`, truncado ao segundo. */
function deslocamentoMs(fmt: Intl.DateTimeFormat, ms: number): number {
  const seg = Math.floor(ms / 1000) * 1000;
  const p = partesLocais(fmt, seg);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - seg;
}

/**
 * Menor instante cujas partes locais sao >= `AAAA-MM-01T00:00:00`. Os candidatos sao
 * `alvo - deslocamento`, com o deslocamento medido em alvo + k horas (k de -36 a 36).
 */
function bordaCivil(fmt: Intl.DateTimeFormat, ano: number, mes: number): Date {
  const alvo = Date.UTC(ano, mes - 1, 1);
  const chave = `${new Date(alvo).toISOString().slice(0, 7)}-01T00:00:00`;
  const deslocamentos = Array.from(new Set(SONDAS_HORAS.map((k) => deslocamentoMs(fmt, alvo + k * UMA_HORA_MS))));
  let borda = Number.POSITIVE_INFINITY;
  for (const deslocamento of deslocamentos) {
    const candidato = alvo - deslocamento;
    if (candidato < borda && chaveLocal(fmt, candidato) >= chave) borda = candidato;
  }
  if (!Number.isFinite(borda)) throw new RangeError('borda civil indeterminada');
  return new Date(borda);
}

/**
 * Mes civil `YYYY-MM` no fuso IANA. `start` e o menor instante cujas partes locais
 * (Intl, hourCycle h23) sao >= `AAAA-MM-01T00:00:00`; `end` aplica a mesma regra ao mes
 * seguinte. Meia-noite repetida fica com a primeira ocorrencia; meia-noite inexistente,
 * com o primeiro instante valido do dia 1. `date` e o dia UTC de `start`; `until` e o dia
 * UTC de `end`, mais 1 dia quando `end` nao e 00:00Z, exclusivo como a rota espera
 * (availability.service.ts:161 e :176). Mes ou fuso invalido lanca RangeError.
 */
export function civilMonthWindow(month: string, timeZone: string): CivilMonthWindow {
  const m = MES.exec(month);
  if (!m) throw new RangeError('mes civil invalido');
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const start = bordaCivil(fmt, ano, mes);
  const end = bordaCivil(fmt, ano, mes + 1);
  const date = start.toISOString().slice(0, 10);
  const meiaNoiteUtc = end.getTime() % UM_DIA_MS === 0;
  const until = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + (meiaNoiteUtc ? 0 : UM_DIA_MS),
  )
    .toISOString()
    .slice(0, 10);
  return { start, end, date, until };
}

/** Verdadeiro quando `startAt` cai em [start, end); instante ilegivel fica fora. */
export function isInCivilWindow(startAtIso: string, w: Pick<CivilMonthWindow, 'start' | 'end'>): boolean {
  const t = new Date(startAtIso).getTime();
  return !Number.isNaN(t) && t >= w.start.getTime() && t < w.end.getTime();
}
