import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { addMessageSchema, listMessagesQuerySchema } from '@/lib/support/ticket.schema';

/**
 * Mensagens de um Support Ticket (T-049).
 *
 * - GET  /api/v1/support/tickets/[id]/messages -> thread (paginada) do ticket.
 * - POST /api/v1/support/tickets/[id]/messages -> resposta do aluno + anexos.
 *
 * IDOR-safe: toda operação primeiro resolve o ticket FILTRANDO por
 * `userId = auth.id`. Um aluno nunca lê nem escreve na thread de outro; quando o
 * ticket existe mas pertence a outro titular, devolvemos 404 (e não 403) para
 * não vazar a existência do recurso alheio. Mensagens internas (`isInternal`)
 * são da visão administrativa e nunca aparecem para o aluno.
 *
 * Anexos: validados/sanitizados no boundary (`addMessageSchema` reaproveita
 * `attachmentDescriptorSchema`). O binário é resolvido pela camada de upload
 * (Asset); aqui persistimos o manifest sanitizado na auditoria. A linkagem
 * durável Asset<->SupportMessage e a UI/API canônica chegam em T-067.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Mensagem serializável da thread do aluno (sem campos operacionais internos). */
function serializeMessage(message: {
  id: string;
  body: string;
  authorRole: string;
  authorId: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    body: message.body,
    authorRole: message.authorRole,
    authorId: message.authorId,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * Resolve um ticket garantindo posse pelo aluno autenticado.
 * Retorna `null` quando inexistente OU de outro titular (mesma resposta 404
 * em ambos os casos, anti-enumeração).
 */
async function findOwnTicket(ticketId: string, userId: string) {
  return prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true, status: true },
  });
}

/**
 * GET /api/v1/support/tickets/[id]/messages?page=1&limit=20
 * Lista a thread (mais antigas primeiro) do ticket do aluno autenticado.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const parsedQuery = listMessagesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetros inválidos.', parsedQuery.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { page, limit } = parsedQuery.data;

  try {
    const ticket = await findOwnTicket(id, auth.id);
    if (!ticket) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }

    // Mensagens internas (admin) nunca vazam para o aluno.
    const where = { ticketId: ticket.id, isInternal: false };
    const [total, messages] = await prisma.$transaction([
      prisma.supportMessage.count({ where }),
      prisma.supportMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, body: true, authorRole: true, authorId: true, createdAt: true },
      }),
    ]);

    return NextResponse.json(
      apiResponse({
        ticketId: ticket.id,
        status: ticket.status,
        items: messages.map(serializeMessage),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    );
  } catch (err) {
    logger.error(
      'GET /api/v1/support/tickets/[id]/messages',
      { action: 'support_message_list', userId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * POST /api/v1/support/tickets/[id]/messages
 * Adiciona uma resposta do aluno (com anexos opcionais sanitizados) a um ticket
 * próprio que ainda esteja aberto. Reabre tickets resolvidos pelo admin quando o
 * aluno volta a escrever; tickets CLOSED não aceitam novas mensagens.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Rate limit por aluno: evita flood de respostas/anexos.
  const limit = await checkRateLimit(`support:message:create:${auth.id}`, RATE_LIMITS.GENERAL);
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

  const parsed = addMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    const ticket = await findOwnTicket(id, auth.id);
    if (!ticket) {
      return NextResponse.json(apiResponse(null, 'Ticket não encontrado.'), { status: 404 });
    }
    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        apiResponse(null, 'Este ticket está fechado. Abra um novo ticket para continuar.'),
        { status: 409 },
      );
    }

    // Manifest de anexos já sanitizado pelo schema; binário/linkagem em T-067.
    const attachmentManifest = (input.attachments ?? []).map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      ...(a.storageKey ? { storageKey: a.storageKey } : {}),
    }));

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: auth.id,
          authorRole: 'STUDENT',
          body: input.body,
          isInternal: false,
        },
        select: { id: true, body: true, authorRole: true, authorId: true, createdAt: true },
      });

      // Resposta do aluno reabre um ticket que o admin havia marcado como
      // RESOLVED/PENDING; só `updatedAt` muda se já estava OPEN.
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.status === 'RESOLVED' || ticket.status === 'PENDING' ? 'OPEN' : ticket.status,
          resolvedAt: null,
        },
      });

      // AuditLog.adminId guarda o AUTOR da ação (aqui, o próprio aluno); o
      // modelo de auditoria com ator genérico chega em T-067.
      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: 'support_message_created',
          resourceType: 'support_ticket',
          resourceId: ticket.id,
          metadata: {
            messageId: created.id,
            attachmentCount: attachmentManifest.length,
            attachments: attachmentManifest,
          } as never,
        },
      });

      return created;
    });

    logger.info('support.message.created', {
      action: 'support_message_created',
      ticketId: ticket.id,
      messageId: message.id,
      userId: auth.id,
      attachmentCount: attachmentManifest.length,
    });

    return NextResponse.json(
      apiResponse(
        { ...serializeMessage(message), attachments: attachmentManifest },
        null,
        'Mensagem enviada.',
      ),
      { status: 201 },
    );
  } catch (err) {
    logger.error(
      'POST /api/v1/support/tickets/[id]/messages',
      { action: 'support_message_create', userId: auth.id, ticketId: id },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao enviar a mensagem. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
