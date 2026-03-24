import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { UserRole } from '@/lib/constants/enums';

/** GET /api/v1/admin/students */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const skip = (page - 1) * limit;

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: UserRole.STUDENT },
        select: {
          id: true,
          name: true,
          email: true,
          country: true,
          timezone: true,
          preferredLanguage: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where: { role: UserRole.STUDENT } }),
    ]);

    return NextResponse.json(apiResponse({ data: users, total, page, limit }));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
