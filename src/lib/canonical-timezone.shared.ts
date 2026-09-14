// Modulo CLIENT-SAFE do fuso canonico da agenda (item 018).
// NAO importar prisma aqui: este arquivo entra no bundle de componentes
// 'use client' (useTimezone, AvailabilityEditor). O acesso ao banco vive em
// `./canonical-timezone` (server-only).

export const CANONICAL_TIMEZONE_SETTING_KEY = 'timezone';

// Fallback quando a tabela app_settings nao responde (linha ausente, erro de
// banco, ambiente de teste sem seed). O valor canonico persistido vive em
// app_settings e pode ser alterado sem deploy.
export const DEFAULT_CANONICAL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte "HH:mm" no dia de `date` (componentes UTC de `date` = dia civil
 * alvo) para o instante UTC correspondente no timezone IANA dado.
 *
 * Algoritmo de sondagem via Intl: formata uma probe em UTC pelo formatter do
 * timezone e deriva o offset real daquele momento, em vez de assumir offset
 * fixo. Este e o UNICO conversor de horario local da agenda; availability.service
 * (geracao de slots) e cron.service (agendamento recorrente) o consomem com o
 * MESMO fuso canonico, garantindo que o mesmo "HH:mm" vira o mesmo instante
 * UTC nos dois produtores.
 */
export function localTimeToUtc(date: Date, timeHHmm: string, ianaTimezone: string): Date {
  const [hours, minutes] = timeHHmm.split(':').map(Number);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  const localIso = `${year}-${month}-${day}T${hh}:${mm}:00`;
  const probe = new Date(`${localIso}Z`);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(probe);
  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

  const tzYear = getPart('year');
  const tzMonth = getPart('month') - 1;
  const tzDay = getPart('day');
  const tzHour = getPart('hour') % 24;
  const tzMinute = getPart('minute');
  const tzSecond = getPart('second');

  const localAsUtcMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = probe.getTime() - localAsUtcMs;

  const desiredLocalMs = Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0);
  return new Date(desiredLocalMs + offsetMs);
}
