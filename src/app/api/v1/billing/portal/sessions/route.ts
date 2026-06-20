import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { customerPortalService } from '@/lib/billing/customer-portal.service';
import { ROUTES } from '@/lib/constants/routes';

const CreatePortalSessionSchema = z.object({
  returnTo: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = CreatePortalSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const session = await customerPortalService.createSessionForUser(
      authResult.id,
      parsed.data.returnTo,
    );

    return NextResponse.json(
      apiResponse(session, null, 'Sessão do Customer Portal criada.'),
    );
  } catch (err) {
    if (err instanceof AppError) {
      const supportCta =
        err.code === 'PAYMENT_070'
          ? {
              label: 'Falar com suporte',
              href: ROUTES.SUPPORT,
            }
          : null;

      return NextResponse.json(
        {
          ...apiResponse(supportCta ? { supportCta } : null, err.message),
          code: err.code,
        },
        { status: err.status },
      );
    }

    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
