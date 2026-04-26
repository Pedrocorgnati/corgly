import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/v1/documents/search?q=<term>&page=<n>&limit=<n>
 *
 * Busca por ocorrencias do termo no plainTextSnapshot de SessionDocuments
 * acessiveis pelo usuario logado.
 *
 * Escopo:
 *   - STUDENT → apenas docs de sessoes onde studentId === userId
 *   - ADMIN   → todos os docs
 *
 * Retorna itens com snippet contendo o termo destacado (marcadores <mark>).
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');

  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Nao autenticado.'), { status: 401 });
  }

  const rl = checkRateLimit(`docs-search:${userId}`, RATE_LIMITS.SESSIONS_CREATE);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 1 minuto.'),
      { status: 429 },
    );
  }

  const { searchParams } = request.nextUrl;
  const rawQ = (searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')));

  if (rawQ.length < 2) {
    return NextResponse.json(
      apiResponse({ data: [], total: 0, page, limit, totalPages: 0 }),
    );
  }

  // Sanitiza o termo (evita wildcards/injection no LIKE)
  const q = rawQ.replace(/[%_\\]/g, (c) => `\\${c}`);
  const like = `%${q}%`;

  try {
    const where = {
      plainTextSnapshot: { contains: q },
      ...(role === 'ADMIN'
        ? {}
        : { session: { studentId: userId } }),
    } as const;

    const [total, docs] = await prisma.$transaction([
      prisma.sessionDocument.count({ where }),
      prisma.sessionDocument.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          sessionId: true,
          updatedAt: true,
          plainTextSnapshot: true,
          session: {
            select: {
              id: true,
              startAt: true,
              status: true,
              studentId: true,
              student: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const data = docs.map((d) => {
      const text = d.plainTextSnapshot ?? '';
      const lower = text.toLowerCase();
      const idx = lower.indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + q.length + 60);
      const raw = text.slice(start, end);
      // Highlight inline via marcador <mark> — consumidor e responsavel por renderizar.
      const escaped = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      const snippet = (start > 0 ? '…' : '') + escaped.replace(re, (m) => `<mark>${m}</mark>`) + (end < text.length ? '…' : '');

      return {
        id: d.id,
        sessionId: d.sessionId,
        updatedAt: d.updatedAt.toISOString(),
        session: {
          id: d.session.id,
          startAt: d.session.startAt.toISOString(),
          status: d.session.status,
          studentName: d.session.student?.name ?? null,
        },
        snippet,
      };
    });

    return NextResponse.json(
      apiResponse({
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }),
    );
  } catch {
    // `like` nao utilizado porque Prisma `contains` ja cuida do LIKE seguro;
    // mantemos a sanitizacao acima caso uma futura migracao passe para $queryRaw.
    void like;
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
