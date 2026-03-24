import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { UserRole } from '@/lib/constants/enums';

/** GET /api/v1/admin/students/[id] */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id, role: UserRole.STUDENT },
      select: {
        id: true,
        name: true,
        email: true,
        country: true,
        timezone: true,
        preferredLanguage: true,
        emailVerified: true,
        maxFutureSessions: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(apiResponse(null, 'Estudante não encontrado.'), { status: 404 });
    }

    return NextResponse.json(apiResponse(user));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** PATCH /api/v1/admin/students/[id] — update maxFutureSessions etc */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    // TODO: Implementar via /auto-flow execute
    return NextResponse.json(apiResponse(null, 'Not implemented - run /auto-flow execute'), { status: 501 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
