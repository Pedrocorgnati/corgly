import { NextRequest, NextResponse } from 'next/server';
import { CookieConsentSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';
import crypto from 'crypto';

function getSessionFingerprint(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex');
}

/** POST /api/v1/auth/cookie-consent */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CookieConsentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Dados inválidos.'), { status: 400 });
    }

    const userId = request.headers.get('x-user-id') ?? undefined;
    const sessionFingerprint = userId ? undefined : getSessionFingerprint(request);

    await authService.updateCookieConsent({ userId, sessionFingerprint, data: parsed.data });
    return NextResponse.json(apiResponse(null, null, 'Preferências salvas.'), { status: 201 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** PATCH /api/v1/auth/cookie-consent */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CookieConsentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Dados inválidos.'), { status: 400 });
    }

    const userId = request.headers.get('x-user-id') ?? undefined;
    const sessionFingerprint = userId ? undefined : getSessionFingerprint(request);

    await authService.updateCookieConsent({ userId, sessionFingerprint, data: parsed.data });
    return NextResponse.json(apiResponse(null, null, 'Preferências atualizadas.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
