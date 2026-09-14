// Modulo SERVER-ONLY do fuso canonico da agenda (item 018).
// Fonte unica de verdade: linha `timezone` da tabela app_settings.
// Componentes client nunca devem importar este arquivo (ele puxa prisma);
// para constantes e conversor puro use `./canonical-timezone.shared`.

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  CANONICAL_TIMEZONE_SETTING_KEY,
  DEFAULT_CANONICAL_TIMEZONE,
  localTimeToUtc,
} from './canonical-timezone.shared';

export {
  CANONICAL_TIMEZONE_SETTING_KEY,
  DEFAULT_CANONICAL_TIMEZONE,
  localTimeToUtc,
} from './canonical-timezone.shared';

/**
 * Fuso canonico persistido em app_settings, com fallback para o default.
 *
 * Desde o GAP-07 a queda no default deixa rastro: `warn` quando a linha falta e
 * `error` quando a leitura falha ou o valor gravado nao e um fuso que o Intl
 * deste runtime conhece. O contexto leva so nome e codigo do erro; o erro nunca
 * vai como terceiro argumento, porque `logger.error` serializaria message e
 * stack (logger.ts:74-76). O valor invalido tambem nao vai ao log: e texto
 * livre gravado fora do app.
 */
export function fusoIanaValido(fuso: string): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat('en-US', { timeZone: fuso }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

export async function getCanonicalTimezone(): Promise<string> {
  const contexto = {
    action: 'canonical-timezone.read',
    key: CANONICAL_TIMEZONE_SETTING_KEY,
    fallback: DEFAULT_CANONICAL_TIMEZONE,
  };
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: CANONICAL_TIMEZONE_SETTING_KEY },
    });
    if (setting?.value) {
      if (fusoIanaValido(setting.value)) return setting.value;
      // Sem este desvio o valor viraria RangeError em localTimeToUtc (500 no
      // POST de disponibilidade, recorrencia sem agendar).
      logger.error('[canonical-timezone] fallback', { ...contexto, reason: 'invalid-value' });
      return DEFAULT_CANONICAL_TIMEZONE;
    }
  } catch (error) {
    // Banco indisponivel: segue o default documentado, com log seguro.
    logger.error('[canonical-timezone] fallback', {
      ...contexto,
      reason: 'read-failed',
      errorName: error instanceof Error ? error.name : 'unknown',
      errorCode:
        typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown',
    });
    return DEFAULT_CANONICAL_TIMEZONE;
  }
  // Ambiente sem a linha (migration do ST003 ainda nao aplicada ou sem seed).
  logger.warn('[canonical-timezone] fallback', { ...contexto, reason: 'missing' });
  return DEFAULT_CANONICAL_TIMEZONE;
}

/** Converte "HH:mm" com o fuso canonico persistido (paridade entre produtores). */
export async function canonicalLocalTimeToUtc(date: Date, timeHHmm: string): Promise<Date> {
  const tz = await getCanonicalTimezone();
  return localTimeToUtc(date, timeHHmm, tz);
}
