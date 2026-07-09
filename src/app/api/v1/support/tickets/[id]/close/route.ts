import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Fechamento de um Support Ticket pelo próprio aluno (T-049).
 *
 * - POST /api/v1/support/tickets/[id]/close -> marca o ticket como CLOSED.
 *
 * IDOR-safe: o ticket é resolvido FILTRANDO por `userId = auth.id`; um aluno só
 * fecha o próprio ticket. Ticket inexistente ou de outro titular devolve 404
 * (anti-enumeração, igual à rota de mensagens). Operação idempotente: fechar um
 * ticket já CLOSED retorna 200 sem novo efeito nem novo registro de auditoria.
 *
 * AuditLog é gravado direto via Prisma (adminId = autor da ação = o aluno); a
 * UI/API canônica de auditoria vem em T-067.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: auth.id },
      select: { id: true, status: true },
    });
    if (!ticket) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }

    // Idempotência: já fechado -> no-op (sem novo audit log).
    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        apiResponse(
          { id: ticket.id, status: 'CLOSED' },
          null,
          'Este ticket já estava fechado.',
        ),
      );
    }

    const closed = await prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'CLOSED', resolvedAt: new Date() },
        select: { id: true, status: true, resolvedAt: true },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: 'support_ticket_closed',
          resourceType: 'support_ticket',
          resourceId: ticket.id,
          metadata: { previousStatus: ticket.status } as never,
        },
      });

      return updated;
    });

    logger.info('support.ticket.closed', {
      action: 'support_ticket_closed',
      ticketId: closed.id,
      userId: auth.id,
    });

    return NextResponse.json(
      apiResponse(
        {
          id: closed.id,
          status: closed.status,
          resolvedAt: closed.resolvedAt ? closed.resolvedAt.toISOString() : null,
        },
        null,
        'Ticket fechado.',
      ),
    );
  } catch (err) {
    logger.error(
      'POST /api/v1/support/tickets/[id]/close',
      { action: 'support_ticket_close', userId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao fechar o ticket. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
