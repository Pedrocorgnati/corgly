/**
 * Dia civil de um instante UTC em um fuso IANA.
 *
 * Saiu de `useCalendar` no item 036 para que as reservas proprias do aluno sejam
 * agrupadas com EXATAMENTE a mesma chave de dia dos horarios livres: duas copias
 * desta conta poriam a mesma aula em dias diferentes da grade.
 */
export interface CivilDateParts {
  year: number;
  month: number;
  day: number;
}

export function getCivilDateParts(instant: Date, timeZone?: string): CivilDateParts {
  if (!timeZone) {
    return {
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    };
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);

  return { year: part('year'), month: part('month'), day: part('day') };
}

/** Chave `YYYY-MM-DD` do dia civil de `startAt` no fuso recebido. */
export function toDateKey(startAt: string, timeZone?: string): string {
  const { year, month, day } = getCivilDateParts(new Date(startAt), timeZone);

  return [year, month, day]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}
