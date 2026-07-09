import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { UserRole } from '@/lib/constants/enums';
import type { StudentNotesPayload } from '@/lib/support/admin-ticket.schema';

/**
 * Notas internas de um aluno, agregadas cross-ticket (T-051 / AD-15).
 *
 * - GET /api/v1/admin/students/[id]/notes -> o aluno + todas as notas internas
 *   (`SupportMessage.isInternal=true`) registradas em seus tickets + a lista de
 *   tickets disponíveis para anexar uma nova nota.
 *
 * Notas internas vivem presas a um ticket (não há nota "solta" de aluno no
 * modelo atual); esta rota apenas as agrega para a visão por aluno. A criação
 * de uma nota acontece via `POST /api/v1/admin/support/tickets/[id]` com
 * `isInternal:true` (auditado lá). Guard: `requireAdmin`. Leitura idempotente,
 * sem audit log.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/admin/students/[id]/notes */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const student = await prisma.user.findFirst({
      where: { id, role: UserRole.STUDENT },
      select: { id: true, name: true, email: true },
    });

    if (!student) {
      return NextResponse.json(apiResponse(null, 'Aluno não encontrado.'), { status: 404 });
    }

    const [notes, openTickets] = await Promise.all([
      prisma.supportMessage.findMany({
        where: { isInternal: true, ticket: { userId: id } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          body: true,
          authorId: true,
          createdAt: true,
          ticket: { select: { id: true, subject: true } },
        },
      }),
      prisma.supportTicket.findMany({
        where: { userId: id, status: { in: ['OPEN', 'PENDING'] } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, subject: true, status: true },
      }),
    ]);

    const payload: StudentNotesPayload = {
      student,
      notes: notes.map((n) => ({
        id: n.id,
        ticketId: n.ticket.id,
        ticketSubject: n.ticket.subject,
        body: n.body,
        authorId: n.authorId,
        createdAt: n.createdAt.toISOString(),
      })),
      openTickets,
    };

    return NextResponse.json(apiResponse(payload));
  } catch (err) {
    logger.error(
      'GET /api/v1/admin/students/[id]/notes',
      { action: 'admin_student_notes_list', adminId: auth.id, studentId: id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
