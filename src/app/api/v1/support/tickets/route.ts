import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createTicketSchema, listTicketsQuerySchema } from '@/lib/support/ticket.schema';

/**
 * Endpoints de coleção de Support Tickets (T-049).
 *
 * - GET  /api/v1/support/tickets       -> lista os tickets do PRÓPRIO aluno.
 * - POST /api/v1/support/tickets       -> cria um ticket + 1ª mensagem.
 *
 * Escopo per-aluno (IDOR-safe): só o perfil STUDENT acessa estas rotas
 * (`requireStudent`), e toda leitura/escrita é filtrada por `userId = auth.id`.
 * Um aluno nunca enxerga nem escreve no ticket de outro; as rotas
 * administrativas (visão cross-aluno) vivem sob `/api/v1/admin/*`. Quando o
 * ticket referencia uma sessão (`sessionId`), a posse da sessão é validada
 * contra `auth.id` antes da criação (impede vincular ticket a sessão alheia).
 *
 * Anexos: validados e sanitizados no boundary (`createTicketSchema` ->
 * `attachmentDescriptorSchema`: filename sanitizado, MIME allowlist, limite de
 * 10 MiB, teto de 5 por mensagem). O binário em si é resolvido pela camada de
 * upload (Asset); aqui persistimos o manifest sanitizado na auditoria. A
 * linkagem durável Asset<->SupportMessage e a UI/API canônica de auditoria
 * chegam em T-067.
 */

/** Resposta serializável de um ticket na listagem do aluno. */
function serializeTicket(ticket: {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  _count: { messages: number };
  messages: { body: string; authorRole: string; createdAt: Date }[];
}) {
  const last = ticket.messages[0];
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    messageCount: ticket._count.messages,
    lastMessage: last
      ? {
          // Preview curto: a listagem não precisa do corpo inteiro.
          preview: last.body.slice(0, 140),
          authorRole: last.authorRole,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/**
 * GET /api/v1/support/tickets?page=1&limit=10&status=OPEN
 * Lista os tickets do aluno autenticado (paginado, mais recentes primeiro).
 */
export async function GET(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const parsedQuery = listTicketsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetros inválidos.', parsedQuery.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { page, limit, status } = parsedQuery.data;
  // Escopo IDOR-safe: SEMPRE preso ao titular autenticado.
  const where = { userId: auth.id, ...(status ? { status } : {}) };

  try {
    const [total, tickets] = await prisma.$transaction([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { messages: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    return NextResponse.json(
      apiResponse({
        data: tickets.map(serializeTicket),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/support/tickets', { action: 'support_ticket_list', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * POST /api/v1/support/tickets
 * Cria um ticket do aluno autenticado com a primeira mensagem (e anexos
 * opcionais já sanitizados). Auditoria gravada direto via Prisma.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  // Rate limit por aluno: evita flood de abertura de tickets.
  const limit = await checkRateLimit(`support:ticket:create:${auth.id}`, RATE_LIMITS.GENERAL);
  if (!limit.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitações. Tente novamente em alguns minutos.'),
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const input = parsed.data;

  // IDOR entre alunos: se o ticket referencia uma sessão, ela PRECISA pertencer
  // ao aluno autenticado. Sem esta checagem um aluno poderia vincular o próprio
  // ticket a uma sessão alheia, corrompendo a proveniência e vazando a
  // existência da sessão de outro aluno na visão administrativa.
  if (input.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: input.sessionId },
      select: { studentId: true },
    });
    if (!session || session.studentId !== auth.id) {
      return NextResponse.json(
        apiResponse(null, 'Sessão inválida ou não pertence a você.'),
        { status: 403 },
      );
    }
  }

  // Manifest de anexos já sanitizado pelo schema (filename limpo, MIME/limite
  // validados). Persistido na auditoria; binário/linkagem durável em T-067.
  const attachmentManifest = (input.attachments ?? []).map((a) => ({
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    ...(a.storageKey ? { storageKey: a.storageKey } : {}),
  }));

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          subject: input.subject,
          priority: input.priority,
          status: 'OPEN',
          userId: auth.id,
          sessionId: input.sessionId ?? null,
        },
        select: { id: true, subject: true, status: true, priority: true, createdAt: true },
      });

      await tx.supportMessage.create({
        data: {
          ticketId: created.id,
          authorId: auth.id,
          authorRole: 'STUDENT',
          body: input.message,
          isInternal: false,
        },
      });

      // AuditLog.adminId guarda o AUTOR da ação (aqui, o próprio aluno), não
      // necessariamente um admin. O modelo unificado de auditoria com campo de
      // ator genérico chega em T-067; até lá, adminId = autor da ação.
      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: 'support_ticket_created',
          resourceType: 'support_ticket',
          resourceId: created.id,
          metadata: {
            priority: created.priority,
            attachmentCount: attachmentManifest.length,
            attachments: attachmentManifest,
          } as never,
        },
      });

      return created;
    });

    logger.info('support.ticket.created', {
      action: 'support_ticket_created',
      ticketId: ticket.id,
      userId: auth.id,
      attachmentCount: attachmentManifest.length,
    });

    return NextResponse.json(
      apiResponse(
        {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt.toISOString(),
          attachments: attachmentManifest,
        },
        null,
        'Ticket aberto. Você pode acompanhar e responder pelo seu painel de suporte.',
      ),
      { status: 201 },
    );
  } catch (err) {
    logger.error('POST /api/v1/support/tickets', { action: 'support_ticket_create', userId: auth.id }, err);
    return NextResponse.json(
      apiResponse(null, 'Erro ao abrir o ticket. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
