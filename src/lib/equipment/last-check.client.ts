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

/**
 * Lê o último check persistido. Retorna null em SSR, quando ausente ou quando o
 * payload estiver corrompido (nunca lança).
 */
export function readLastEquipmentCheck(): LastEquipmentCheck | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastEquipmentCheck>;
    if (!parsed || typeof parsed.status !== 'string' || typeof parsed.at !== 'string') {
      return null;
    }
    return {
      status: parsed.status as EquipmentStatus,
      failedChecks: Array.isArray(parsed.failedChecks)
        ? (parsed.failedChecks as EquipmentFailure[])
        : [],
      at: parsed.at,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

/** Grava o último check. No-op silencioso em SSR ou quota excedida. */
export function writeLastEquipmentCheck(value: LastEquipmentCheck): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota/serialização — ignora; persistência é best-effort.
  }
}

/** Rótulo amigável por tipo de falha (para resumo no lobby/onboarding). */
export const EQUIPMENT_FAILURE_LABEL: Record<EquipmentFailure, string> = {
  camera: 'Câmera',
  microphone: 'Microfone',
  permission: 'Permissões',
  bandwidth: 'Conexão',
};
