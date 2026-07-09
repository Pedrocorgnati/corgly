import 'server-only';
import { prisma } from '@/lib/prisma';
import type {
  EmailTemplateType,
  EmailTemplateLocale,
  EmailChannel,
} from '@/lib/email/email-template.schema';

/**
 * Servico de dominio dos email templates versionados (T-054 / ST001+ST002).
 *
 * Maquina de estados: DRAFT -> ACTIVE (publicar) -> ARCHIVED (arquivar).
 * Transicoes permitidas: draft->active, active->archived, draft->archived.
 * Proibidas: active->draft, archived->* (estado terminal).
 *
 * Cada transicao registra autor (adminId) e versao em AuditLog, satisfazendo o
 * acceptance "Alteracao registra autor e versao".
 */

export interface TemplateKey {
  type: EmailTemplateType;
  locale: EmailTemplateLocale;
  channel: EmailChannel;
}

/** Proxima versao para a tupla (type, locale, channel). 1 quando inexistente. */
export async function nextTemplateVersion(key: TemplateKey): Promise<number> {
  const latest = await prisma.emailTemplate.findFirst({
    where: { type: key.type, locale: key.locale, channel: key.channel },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export type TemplateAuditAction =
  | 'email_template_created'
  | 'email_template_updated'
  | 'email_template_published'
  | 'email_template_archived';

/**
 * Registra a alteracao em AuditLog. Author = adminId; metadata carrega versao,
 * tipo, locale, canal e status resultante. Falha de audit e nao-critica.
 */
export async function recordTemplateAudit(params: {
  adminId: string;
  action: TemplateAuditAction;
  templateId: string;
  type: string;
  locale: string;
  channel: string;
  version: number;
  status: string;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        adminId: params.adminId,
        action: params.action,
        resourceType: 'email_template',
        resourceId: params.templateId,
        metadata: {
          type: params.type,
          locale: params.locale,
          channel: params.channel,
          version: params.version,
          status: params.status,
        },
      },
    })
    .catch(() => null);
}
