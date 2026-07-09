import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  ADMIN_TICKET_ACTION_TO_STATUS,
  adminTicketActionSchema,
  adminTicketMessageSchema,
} from '@/lib/support/admin-ticket.schema';
import type {
  AdminTicketDetail,
  AdminTicketMessage,
} from '@/lib/support/admin-ticket.schema';

/**
 * Operações administrativas sobre UM Support Ticket (T-051 / AD-39).
 *
 * - GET   /api/v1/admin/support/tickets/[id] -> detalhe + thread COMPLETA
 *         (inclui notas internas, que o aluno nunca vê).
 * - PATCH /api/v1/admin/support/tickets/[id] -> muda status (RESOLVE/CLOSE/REOPEN).
 * - POST  /api/v1/admin/support/tickets/[id] -> adiciona resposta (visível) OU
 *         nota interna (`isInternal:true`, separada da thread do aluno).
 *
 * Guard: `requireAdmin` (403 se não-admin, 401 se anônimo). Toda escrita
 * sensível grava `AuditLog` (adminId = ator) de forma atômica na transação,
 * satisfazendo o critério "toda ação sensível grava audit log". Ticket
 * inexistente devolve 404 antes de qualquer escrita.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serializeAdminMessage(message: {
  id: string;
  body: string;
  authorRole: string;
  authorId: string | null;
  isInternal: boolean;
  createdAt: Date;
}): AdminTicketMessage {
  return {
    id: message.id,
    body: message.body,
    authorRole: message.authorRole,
    authorId: message.authorId,
    isInternal: message.isInternal,
    createdAt: message.createdAt.toISOString(),
  };
}

/** GET /api/v1/admin/support/tickets/[id] */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }

    const internalNoteCount = ticket.messages.filter((m) => m.isInternal).length;
    const visible = [...ticket.messages].reverse().find((m) => !m.isInternal) ?? null;

    const detail: AdminTicketDetail = {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      student: ticket.user
        ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email }
        : null,
      messageCount: ticket._count.messages,
      internalNoteCount,
      lastMessage: visible
        ? {
            preview: visible.body.slice(0, 140),
            authorRole: visible.authorRole,
            isInternal: visible.isInternal,
            createdAt: visible.createdAt.toISOString(),
          }
        : null,
      resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map(serializeAdminMessage),
    };

    return NextResponse.json(apiResponse(detail));
  } catch (err) {
    logger.error(
      'GET /api/v1/admin/support/tickets/[id]',
      { action: 'admin_support_ticket_detail', adminId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** PATCH /api/v1/admin/support/tickets/[id]: muda status. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = adminTicketActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Ação inválida.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const nextStatus = ADMIN_TICKET_ACTION_TO_STATUS[parsed.data.action];

  try {
    const existing = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.update({
        where: { id },
        data: {
          status: nextStatus,
          // RESOLVE carimba resolvedAt; REOPEN limpa; CLOSE preserva o existente.
          ...(nextStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
          ...(nextStatus === 'OPEN' ? { resolvedAt: null } : {}),
        },
        select: { id: true, status: true, resolvedAt: true },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: 'admin_support_ticket_status_changed',
          resourceType: 'support_ticket',
          resourceId: ticket.id,
          metadata: { from: existing.status, to: ticket.status } as never,
        },
      });

      return ticket;
    });

    logger.info('admin.support.ticket.status_changed', {
      action: 'admin_support_ticket_status_changed',
      adminId: auth.id,
      ticketId: updated.id,
      status: updated.status,
    });

    return NextResponse.json(
      apiResponse(
        {
          id: updated.id,
          status: updated.status,
          resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
        },
        null,
        'Status atualizado.',
      ),
    );
  } catch (err) {
    logger.error(
      'PATCH /api/v1/admin/support/tickets/[id]',
      { action: 'admin_support_ticket_status_change', adminId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro ao atualizar o ticket.'), { status: 500 });
  }
}

/** POST /api/v1/admin/support/tickets/[id]: resposta OU nota interna. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = adminTicketMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { body, isInternal } = parsed.data;

  try {
    const existing = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }

    // Defesa no boundary (a UI já desabilita "Responder" em ticket fechado):
    // uma resposta VISÍVEL não pode ressuscitar uma thread CLOSED. Notas internas
    // continuam permitidas (anotação operacional pós-fechamento é legítima).
    if (!isInternal && existing.status === 'CLOSED') {
      return NextResponse.json(
        apiResponse(null, 'Não é possível responder um ticket fechado. Reabra-o antes.'),
        { status: 400 },
      );
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId: id,
          authorId: auth.id,
          authorRole: 'ADMIN',
          body,
          isInternal,
        },
        select: {
          id: true,
          body: true,
          authorRole: true,
          authorId: true,
          isInternal: true,
          createdAt: true,
        },
      });

      // Uma resposta visível do admin tira o ticket de OPEN para PENDING
      // (aguardando o aluno). Nota interna NÃO muda o estado percebido pelo aluno.
      if (!isInternal && existing.status === 'OPEN') {
        await tx.supportTicket.update({
          where: { id },
          data: { status: 'PENDING' },
        });
      } else {
        // Mantém updatedAt coerente para ordenar a caixa de entrada por atividade.
        await tx.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } });
      }

      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: isInternal
            ? 'admin_support_internal_note_added'
            : 'admin_support_reply_created',
          resourceType: 'support_ticket',
          resourceId: id,
          metadata: { messageId: created.id, isInternal } as never,
        },
      });

      return created;
    });

    logger.info('admin.support.message.created', {
      action: isInternal ? 'admin_support_internal_note_added' : 'admin_support_reply_created',
      adminId: auth.id,
      ticketId: id,
      messageId: message.id,
    });

    return NextResponse.json(
      apiResponse(
        serializeAdminMessage(message),
        null,
        isInternal ? 'Nota interna registrada.' : 'Resposta enviada ao aluno.',
      ),
      { status: 201 },
    );
  } catch (err) {
    logger.error(
      'POST /api/v1/admin/support/tickets/[id]',
      { action: 'admin_support_message_create', adminId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro ao registrar a mensagem.'), { status: 500 });
  }
}
