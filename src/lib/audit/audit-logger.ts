/**
 * @module lib/audit/audit-logger
 * Audit logging para mutations admin (THREAT-MODEL T-013).
 *
 * Persiste na tabela AuditLog via Prisma (model audit_logs no schema.prisma).
 * Fallback para console.error se a escrita no DB falhar (nunca silenciar).
 */

import { prisma } from '@/lib/prisma';

export interface AuditEntry {
  action: string;
  resource: { type: string; id: string };
  adminId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Registra uma ação administrativa no audit log (tabela audit_logs).
 *
 * @param action  Identificador da ação (ex: 'ADMIN_CREDIT_ADJUST')
 * @param resource Recurso afetado (tipo + id)
 * @param adminId  ID do admin que executou a ação
 * @param metadata Detalhes adicionais (opcionais)
 */
// RESOLVED: audit log migrado de console.info para Prisma (AuditLog table) — SOC2 CC7.1/CC7.2
export async function auditLog(
  action: string,
  resource: { type: string; id: string },
  adminId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        resourceType: resource.type,
        resourceId: resource.id,
        adminId,
        metadata: metadata ?? {},
      },
    });
  } catch (err) {
    // Fallback: nunca silenciar erros de auditoria
    const entry: AuditEntry = {
      action,
      resource,
      adminId,
      metadata,
      timestamp: new Date().toISOString(),
    };
    console.error('[AUDIT][DB_FALLBACK]', JSON.stringify(entry), err);
  }
}
