import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-guard';
import { auditLog } from '@/lib/audit/audit-logger';
import { logger } from '@/lib/logger';

const BodySchema = z.object({ optIn: z.boolean() });

/** PUT /api/v1/profile/marketing-opt-in */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON inválido.'), { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  try {
    const previous = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { marketingOptIn: true },
    });

    const updated = await prisma.user.update({
      where: { id: auth.id },
      data: { marketingOptIn: parsed.data.optIn },
      select: { marketingOptIn: true },
    });

    await auditLog(
      'MARKETING_OPT_IN_CHANGED',
      { type: 'User', id: auth.id },
      auth.id,
      { from: previous?.marketingOptIn ?? null, to: updated.marketingOptIn },
    );

    return NextResponse.json(apiResponse({ marketingOptIn: updated.marketingOptIn }));
  } catch (err) {
    logger.error('marketing-opt-in update failed', { userId: auth.id, action: 'marketing_opt_in' }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
