import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { emailService } from '@/services/email.service';
import { auditLog } from '@/lib/audit/audit-logger';
import { prisma } from '@/lib/prisma';
import { EmailType, SupportedLanguage } from '@/types/enums';
import { AppError } from '@/lib/errors';

const BodySchema = z.object({
  userId: z.string().min(1),
});

/** POST /api/v1/admin/credits/notify-expiring */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'userId é obrigatório.'),
        { status: 400 },
      );
    }

    const { userId } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, preferredLanguage: true },
    });

    if (!user) {
      throw new AppError('USR_001', 'Usuário não encontrado.', 404);
    }

    const locale = (user.preferredLanguage as SupportedLanguage | null) ?? SupportedLanguage.PT_BR;

    await emailService.send({
      to: user.email,
      type: EmailType.CREDIT_EXPIRY_WARNING,
      data: { name: user.name },
      locale,
    });

    auditLog('ADMIN_CREDIT_NOTIFY_EXPIRING', { type: 'User', id: userId }, authResult.id, {
      studentEmail: user.email,
    });

    return NextResponse.json(apiResponse({ sent: true }));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
