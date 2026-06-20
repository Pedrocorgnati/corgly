'use client';

/**
 * Persistência client-side do último equipment check.
 *
 * O serviço server-side (`equipment-check.service.ts`) grava o resultado em
 * `audit_logs` para auditoria, mas não há endpoint de leitura "último check do
 * usuário". O lobby da sala (ON-10/ST-29) precisa exibir o último resultado e
 * permitir refazer sem depender de round-trip ao servidor, então mantemos uma
 * cópia leve em `localStorage`. Tipos vivem aqui (client-safe) e são
 * reexportados pelos tipos do `DeviceTest`.
 */

/** Tipos de falha canônicos, espelham `EquipmentErrorType` do serviço server. */
export type EquipmentFailure = 'camera' | 'microphone' | 'permission' | 'bandwidth';

/** Status consolidado do teste, alinhado a `OverallStatus` do DeviceTest. */
export type EquipmentStatus = 'idle' | 'checking' | 'ok' | 'warning' | 'fail';

export interface LastEquipmentCheck {
  status: EquipmentStatus;
  failedChecks: EquipmentFailure[];
  /** ISO 8601 do momento em que o teste foi concluído. */
  at: string;
  /** Sessão alvo quando o check foi feito no lobby de uma aula específica. */
  sessionId?: string;
}

const STORAGE_KEY = 'corgly:last-equipment-check';
const VALID_STATUSES = new Set<EquipmentStatus>(['idle', 'checking', 'ok', 'warning', 'fail']);
const VALID_FAILURES = new Set<EquipmentFailure>(['camera', 'microphone', 'permission', 'bandwidth']);

/**
 * Lê o último check persistido. Retorna null em SSR, quando ausente ou quando o
 * payload estiver corrompido (nunca lança).
 */
export function readLastEquipmentCheck(): LastEquipmentCheck | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseLastEquipmentCheck(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Snapshot estavel para useSyncExternalStore. */
export function readLastEquipmentCheckRaw(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseLastEquipmentCheck(raw: string | null): LastEquipmentCheck | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastEquipmentCheck>;
    if (
      !parsed ||
      typeof parsed.status !== 'string' ||
      !VALID_STATUSES.has(parsed.status as EquipmentStatus) ||
      typeof parsed.at !== 'string' ||
      Number.isNaN(Date.parse(parsed.at))
    ) {
      return null;
    }
    const failedChecks = Array.isArray(parsed.failedChecks)
      ? parsed.failedChecks.filter((value): value is EquipmentFailure =>
          typeof value === 'string' && VALID_FAILURES.has(value as EquipmentFailure),
        )
      : [];
    return {
      status: parsed.status,
      failedChecks,
      at: parsed.at,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

/** Grava o último check. Retorna false em SSR ou quando o browser bloqueia storage. */
export function writeLastEquipmentCheck(value: LastEquipmentCheck): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Rótulo amigável por tipo de falha (para resumo no lobby/onboarding). */
export const EQUIPMENT_FAILURE_LABEL: Record<EquipmentFailure, string> = {
  camera: 'Câmera',
  microphone: 'Microfone',
  permission: 'Permissões',
  bandwidth: 'Conexão',
};
