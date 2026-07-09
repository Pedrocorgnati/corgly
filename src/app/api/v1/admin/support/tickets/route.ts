import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { adminTicketsQuerySchema } from '@/lib/support/admin-ticket.schema';
import type { AdminTicket } from '@/lib/support/admin-ticket.schema';

/**
 * Caixa de entrada ADMINISTRATIVA de Support Tickets (T-051 / AD-39).
 *
 * - GET /api/v1/admin/support/tickets -> lista CROSS-ALUNO, com filtros por
 *   status, prioridade, aluno (id ou busca por nome/e-mail) e intervalo de data.
 *
 * Diferente das rotas do aluno (`/api/v1/support/*`, presas a `userId=auth.id`),
 * aqui a visão é cross-aluno e exige perfil ADMIN (`requireAdmin`). Cada item
 * embute um resumo do aluno e a contagem de notas internas (`isInternal`) para
 * o operador priorizar sem abrir o ticket. A leitura é idempotente e não gera
 * audit log (somente ações sensíveis de escrita auditam; ver `[id]/route.ts`).
 */

/** Serializa um ticket para a caixa de entrada admin. */
function serializeAdminTicket(ticket: {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  user: { id: string; name: string; email: string } | null;
  _count: { messages: number };
  messages: { body: string; authorRole: string; isInternal: boolean; createdAt: Date }[];
}): AdminTicket {
  const last = ticket.messages.find((m) => !m.isInternal) ?? ticket.messages[0] ?? null;
  const internalNoteCount = ticket.messages.filter((m) => m.isInternal).length;
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    student: ticket.user
      ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email }
      : null,
    messageCount: ticket._count.messages,
    internalNoteCount,
    lastMessage: last
      ? {
          preview: last.body.slice(0, 140),
          authorRole: last.authorRole,
          isInternal: last.isInternal,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/**
 * GET /api/v1/admin/support/tickets
 *   ?page&limit&status&priority&studentId&search&dateFrom&dateTo
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = adminTicketsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetros inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { page, limit, status, priority, studentId, search, dateFrom, dateTo } = parsed.data;

  // Intervalo de data inclusivo: dateTo cobre o dia inteiro (até 23:59:59.999).
  let createdAt: Prisma.DateTimeFilter | undefined;
  if (dateFrom || dateTo) {
    createdAt = {};
    if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  const where: Prisma.SupportTicketWhereInput = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(studentId ? { userId: studentId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(search
      ? {
          // Busca case-insensitive pela collation padrão do MySQL (mesmo padrão
          // de `admin/users`); o conector MySQL não aceita `mode: 'insensitive'`.
          user: {
            OR: [{ name: { contains: search } }, { email: { contains: search } }],
          },
        }
      : {}),
  };

  try {
    const [total, tickets] = await prisma.$transaction([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { messages: true } },
          // Carrega as mensagens recentes para derivar preview + contagem de
          // notas internas sem uma segunda query por ticket.
          messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      }),
    ]);

    return NextResponse.json(
      apiResponse({
        data: tickets.map(serializeAdminTicket),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }),
    );
  } catch (err) {
    logger.error(
      'GET /api/v1/admin/support/tickets',
      { action: 'admin_support_ticket_list', adminId: auth.id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
