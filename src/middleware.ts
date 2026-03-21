import { NextRequest, NextResponse } from 'next/server';
import { getPayloadFromRequest, apiResponse } from '@/lib/auth';

const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/confirm-email',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/webhooks/stripe',
  '/api/v1/content',
  '/api/v1/availability',
];

const ADMIN_ONLY_PATHS = [
  '/api/v1/admin',
  '/api/v1/credits/manual',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept API routes
  if (!pathname.startsWith('/api/v1')) {
    return NextResponse.next();
  }

  // Allow public API paths without auth
  const isPublic = PUBLIC_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isPublic) return NextResponse.next();

  // Verify JWT
  const payload = getPayloadFromRequest(request);
  if (!payload) {
    return NextResponse.json(
      apiResponse(null, 'Não autorizado. Faça login para continuar.'),
      { status: 401 },
    );
  }

  // Admin-only paths
  const isAdminOnly = ADMIN_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isAdminOnly && payload.role !== 'ADMIN') {
    return NextResponse.json(
      apiResponse(null, 'Acesso restrito a administradores.'),
      { status: 403 },
    );
  }

  // Forward user context to route handlers via headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.sub);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-token-version', String(payload.version));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/api/v1/:path*'],
};
