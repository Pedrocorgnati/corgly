/**
 * @module lib/format-datetime
 * Formatação de data/hora timezone-aware — Module 2: Shared Foundations
 *
 * Usa Intl.DateTimeFormat com suporte a DST automático.
 */

type DatetimeFormat = 'short' | 'long' | 'time-only' | 'date-only';

const FALLBACK_TIMEZONE = 'UTC';
const FALLBACK_LOCALE = 'en-US';

function resolveTimezone(timezone: string): string {
  try {
    // Valida timezone via Intl
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    if (typeof console !== 'undefined') {
      console.warn(`[formatDatetime] Invalid timezone: "${timezone}". Falling back to UTC.`);
    }
    return FALLBACK_TIMEZONE;
  }
}

/**
 * Formata uma Date para string legível no timezone especificado.
 *
 * @param date - Data a ser formatada
 * @param timezone - IANA timezone string (ex: 'America/Sao_Paulo', 'Europe/Rome')
 * @param format - 'short' | 'long' | 'time-only' | 'date-only' (default: 'short')
 * @param locale - BCP 47 locale (default: 'en-US')
 *
 * @example
 * formatDatetime(new Date('2025-01-14T17:00Z'), 'America/Sao_Paulo', 'short', 'pt-BR')
 * → "Ter, 14/01 · 14:00"
 */
export function formatDatetime(
  date: Date,
  timezone: string,
  format: DatetimeFormat = 'short',
  locale = FALLBACK_LOCALE,
): string {
  const tz = resolveTimezone(timezone);

  try {
    switch (format) {
      case 'time-only':
        return new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);

      case 'date-only':
        return new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(date);

      case 'long':
        return new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);

      case 'short':
      default: {
        const weekday = new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          weekday: 'short',
        }).format(date);
        const dayMonth = new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          day: '2-digit',
          month: '2-digit',
        }).format(date);
        const time = new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
        return `${weekday}, ${dayMonth} · ${time}`;
      }
    }
  } catch {
    // Fallback para UTC se locale inválido
    return formatDatetime(date, FALLBACK_TIMEZONE, format, FALLBACK_LOCALE);
  }
}

/**
 * Formata duas timezones para exibição dual (aluno/admin).
 * @example
 * formatDualTimezone(date, 'America/Sao_Paulo', 'Europe/Rome')
 * → "14:00 BRT / 18:00 CET"
 */
export function formatDualTimezone(
  date: Date,
  primaryTz: string,
  secondaryTz?: string,
  locale = FALLBACK_LOCALE,
): string {
  const tz1 = resolveTimezone(primaryTz);
  const time1 = new Intl.DateTimeFormat(locale, {
    timeZone: tz1,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);

  if (!secondaryTz) return time1;

  const tz2 = resolveTimezone(secondaryTz);
  const time2 = new Intl.DateTimeFormat(locale, {
    timeZone: tz2,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);

  return `${time1} / ${time2}`;
}

/**
 * Formata uma data para exibição simples em pt-BR (dd/MM/yyyy).
 * Para uso em contextos sem timezone (tabelas admin, listas, etc.).
 */
export function formatDatePtBR(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formata uma data+hora para exibição simples em pt-BR (dd/MM/yyyy, HH:mm).
 * Para uso em contextos sem timezone (tabelas admin, listas, etc.).
 */
export function formatDateTimePtBR(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
