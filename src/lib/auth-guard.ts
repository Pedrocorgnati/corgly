import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';

export interface AuthUser {
  id: string;
  role: string;
  tokenVersion: number;
}

/**
 * Validates the authenticated user from middleware-injected headers.
 * Checks tokenVersion against DB to detect invalidated sessions (e.g., password reset).
 *
 * Returns AuthUser on success, or a 401 NextResponse on failure.
 */
export async function requireAuth(
  request: NextRequest,
): Promise<AuthUser | NextResponse> {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const tokenVersionHeader = request.headers.get('x-token-version');

  if (!userId || !userRole || tokenVersionHeader === null) {
    return NextResponse.json(
      apiResponse(null, 'Não autorizado.'),
      { status: 401 },
    );
  }

  const tokenVersion = parseInt(tokenVersionHeader, 10);

  // Validate tokenVersion against DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, tokenVersion: true },
  });

  if (!user) {
    return NextResponse.json(
      apiResponse(null, 'Usuário não encontrado.'),
      { status: 401 },
    );
  }

  if (user.tokenVersion !== tokenVersion) {
    return NextResponse.json(
      apiResponse(null, 'Sessão invalidada. Faça login novamente.'),
      { status: 401 },
    );
  }

  return {
    id: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
}

/**
 * Requires authenticated user with ADMIN role.
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AuthUser | NextResponse> {
  const result = await requireAuth(request);

  if (result instanceof NextResponse) return result;

  if (result.role !== 'ADMIN') {
    return NextResponse.json(
      apiResponse(null, 'Acesso restrito a administradores.'),
      { status: 403 },
    );
  }

  return result;
}

/**
 * Requires authenticated user with STUDENT role.
 */
export async function requireStudent(
  request: NextRequest,
): Promise<AuthUser | NextResponse> {
  const result = await requireAuth(request);

  if (result instanceof NextResponse) return result;

  if (result.role !== 'STUDENT') {
    return NextResponse.json(
      apiResponse(null, 'Acesso restrito a estudantes.'),
      { status: 403 },
    );
  }

  return result;
}
