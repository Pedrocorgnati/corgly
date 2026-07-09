/**
 * Fonte unica do cookie de consentimento de cookies (`corgly_consent`).
 * Usado tanto pelo banner (primeira escolha) quanto pela pagina de preferencias
 * (gestao posterior). Mantem o formato de serializacao em um so lugar para evitar
 * divergencia entre os dois pontos de escrita.
 */

export const CONSENT_COOKIE_NAME = 'corgly_consent';
export const CONSENT_COOKIE_MAX_AGE = 31536000; // 1 ano em segundos

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

export function getConsentCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CONSENT_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setConsentCookie(value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Deriva o estado granular a partir do valor persistido pelo cookie. */
export function parseConsentCookie(raw: string | null): ConsentChoice {
  if (!raw) return { analytics: false, marketing: false };
  if (raw === 'all') return { analytics: true, marketing: true };
  if (raw === 'essential') return { analytics: false, marketing: false };
  if (raw.startsWith('custom:')) {
    const parts = raw.slice('custom:'.length).split(',');
    return {
      analytics: parts.includes('analytics'),
      marketing: parts.includes('marketing'),
    };
  }
  return { analytics: false, marketing: false };
}

/** Serializa o estado granular no formato canonico do cookie. */
export function serializeConsent(choice: ConsentChoice): string {
  if (choice.analytics && choice.marketing) return 'all';
  if (!choice.analytics && !choice.marketing) return 'essential';
  const parts: string[] = [];
  if (choice.analytics) parts.push('analytics');
  if (choice.marketing) parts.push('marketing');
  return `custom:${parts.join(',')}`;
}
