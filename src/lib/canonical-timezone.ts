// Modulo SERVER-ONLY do fuso canonico da agenda (item 018).
// Fonte unica de verdade: linha `timezone` da tabela app_settings.
// Componentes client nunca devem importar este arquivo (ele puxa prisma);
// para constantes e conversor puro use `./canonical-timezone.shared`.

import { prisma } from '@/lib/prisma';
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

/** Fuso canonico persistido em app_settings, com fallback para o default. */
export async function getCanonicalTimezone(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: CANONICAL_TIMEZONE_SETTING_KEY },
    });
    if (setting?.value) return setting.value;
  } catch {
    // Banco indisponivel ou ambiente sem seed: segue o default documentado.
  }
  return DEFAULT_CANONICAL_TIMEZONE;
}

/** Converte "HH:mm" com o fuso canonico persistido (paridade entre produtores). */
export async function canonicalLocalTimeToUtc(date: Date, timeHHmm: string): Promise<Date> {
  const tz = await getCanonicalTimezone();
  return localTimeToUtc(date, timeHHmm, tz);
}
