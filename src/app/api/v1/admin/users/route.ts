import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus, UserRole } from '@/lib/constants/enums';

/**
 * GET /api/v1/admin/users?search=X&status=active|inactive&page=1&limit=20&sort=name|createdAt
 * Lists students with search, filter, pagination and sort.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const search  = searchParams.get('search') ?? '';
  const status  = searchParams.get('status'); // 'active' | 'inactive' | null (all)
  const sort    = searchParams.get('sort') ?? 'createdAt';
  const order   = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';
  const page    = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)));

  const orderBy: Record<string, 'asc' | 'desc'> = { [sort]: order };

  const where = {
    role: UserRole.STUDENT,
    ...(search
      ? {
          OR: [
            { name:  { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
    ...(status === 'active'   ? { deletionRequestedAt: null }  : {}),
    ...(status === 'inactive' ? { deletionRequestedAt: { not: null } } : {}),
  };

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id:             true,
          name:           true,
          email:          true,
          country:        true,
          timezone:       true,
          emailConfirmed: true,
          createdAt:      true,
          lastLoginAt:    true,
          deletionRequestedAt: true,
          creditBatches: {
            select: { totalCredits: true, usedCredits: true, expiresAt: true },
            where:  { expiresAt: { gt: new Date() } },
          },
          sessions: {
            select: { status: true },
            where:  { status: SessionStatus.COMPLETED },
            take:   1,
            orderBy: { completedAt: 'desc' },
          },
        },
        orderBy: [orderBy],
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.user.count({ where }),
    ]);

    const mapped = users.map((u) => ({
      id:             u.id,
      name:           u.name,
      email:          u.email,
      country:        u.country,
      timezone:       u.timezone,
      emailConfirmed: u.emailConfirmed,
      createdAt:      u.createdAt,
      lastLoginAt:    u.lastLoginAt,
      isActive:       !u.deletionRequestedAt,
      creditBalance:  u.creditBatches.reduce(
        (s, b) => s + (b.totalCredits - b.usedCredits),
        0,
      ),
    }));

    return NextResponse.json(apiResponse({ items: mapped, total, page, limit }));
  } catch (err) {
    console.error('GET /admin/users', err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
