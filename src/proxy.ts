import { NextRequest, NextResponse } from 'next/server';
import { getPayloadFromRequest, apiResponse } from '@/lib/auth';
import { isMfaRecent } from '@/lib/auth/mfa-recency';
import { isAdminMfaBypassed } from '@/lib/auth/mfa-bypass';
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from '@/lib/rate-limit';
import { UserRole } from '@/lib/constants/enums';
import { resolveLandingLocaleFromRequest } from '@/lib/landing-locale-server';

const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/confirm-email',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/resend-confirmation',
  '/api/v1/auth/cancel-deletion',
  '/api/v1/auth/cookie-consent', // Unauthenticated visitors must be able to set cookie consent (LGPD)
  '/api/v1/webhooks/stripe',
  '/api/v1/content',
  '/api/v1/availability',
  '/api/v1/email/unsubscribe',
  '/api/v1/privacy/data-requests', // DSR público: titular anônimo abre pedido sem sessão (LGPD Art. 18)
];

const ADMIN_ONLY_PATHS = [
  '/api/v1/admin',
  '/api/v1/credits/manual',
];

// Rotas de UI admin que exigem MFA recente (redirect 307 para challenge se ausente).
// Assets estaticos, login e a propria challenge nao entram nesta lista (evita loop).
const ADMIN_UI_MFA_REQUIRED = '/admin';
const MFA_CHALLENGE_PATH = '/auth/mfa/challenge';
const MFA_ALLOWLIST_PREFIXES = [
  '/_next',
  '/auth/login',
  '/auth/mfa',
  '/maintenance',
  '/api/',
];

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

function addSecurityHeaders(response: NextResponse, correlationId?: string): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (correlationId) response.headers.set('x-request-id', correlationId);
  return response;
}

// Internal trust headers that must never be accepted from clients.
// These are set exclusively by the proxy after JWT verification.
const INTERNAL_HEADERS = ['x-user-id', 'x-user-role', 'x-token-version'];

function stripInternalHeaders(request: NextRequest): NextRequest {
  const mutable = new Headers(request.headers);
  for (const header of INTERNAL_HEADERS) {
    mutable.delete(header);
  }
  // Return a new NextRequest-compatible object with stripped headers.
  // We cannot mutate NextRequest directly; instead we pass the stripped
  // headers to NextResponse.next() at each return site via a shared helper.
  // Store stripped headers on the request object for use below.
  (request as NextRequest & { _strippedHeaders?: Headers })._strippedHeaders = mutable;
  return request;
}

function nextWithStripped(
  request: NextRequest & { _strippedHeaders?: Headers },
  extraHeaders?: Record<string, string>,
): NextResponse {
  const base = request._strippedHeaders ?? new Headers(request.headers);
  const merged = new Headers(base);
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      merged.set(k, v);
    }
  }
  return NextResponse.next({ request: { headers: merged } });
}

function isPublicLandingPath(pathname: string): boolean {
  if (pathname.startsWith('/api')) return false;
  if (pathname.startsWith('/_next')) return false;
  const privatePrefixes = [
    '/dashboard',
    '/admin',
    '/session',
    '/schedule',
    '/credits',
    '/progress',
    '/account',
    '/billing',
    '/history',
    '/library',
    '/onboarding',
  ];
  return !privatePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function generateCorrelationId(): string {
  // crypto.randomUUID disponivel via Web Crypto (proxy roda no runtime Node.js no Next 16)
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Strip internal trust headers from ALL incoming requests.
  // Prevents clients from forging x-user-id/x-user-role/x-token-version.
  stripInternalHeaders(request);

  // CorrelationId: aceitar x-request-id inbound (mesh/proxy) ou gerar novo.
  const correlationId = request.headers.get('x-request-id') ?? generateCorrelationId();
  (request as NextRequest & { _strippedHeaders?: Headers })._strippedHeaders?.set('x-request-id', correlationId);

  // ─── Maintenance mode ─────────────────────────────────────────────────────
  if (
    process.env.MAINTENANCE_MODE === 'true' &&
    !pathname.startsWith('/api/v1/health') &&
    !pathname.startsWith('/maintenance') &&
    !pathname.startsWith('/_next')
  ) {
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json(
        { error: 'Service temporarily unavailable', code: 'SYS_002' },
        { status: 503 },
      );
      return addSecurityHeaders(res, correlationId);
    }
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  // ─── Non-API routes ────────────────────────────────────────────────────────
  if (!pathname.startsWith('/api/v1')) {
    // Gate de MFA para rotas admin UI (ex: /admin/*).
    // Allowlist: assets, login, a propria challenge e qualquer /api/ (tratada abaixo).
    const isAdminUi = pathname.startsWith(ADMIN_UI_MFA_REQUIRED);
    const isAllowlisted = MFA_ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p));

    if (isAdminUi && !isAllowlisted) {
      const adminPayload = getPayloadFromRequest(request);

      // Sem sessao ou sem role admin: redirect para login (nao para challenge)
      if (!adminPayload || adminPayload.role !== UserRole.ADMIN) {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(loginUrl, { status: 307 });
      }

      // Admin autenticado mas MFA ausente ou expirado: redirect para challenge.
      // Em desenvolvimento com ADMIN_MFA_DEV_BYPASS=true (.env.development.local)
      // apenas ESTE redirect e pulado; o redirect para login acima continua valendo.
      if (!isAdminMfaBypassed() && !isMfaRecent(adminPayload.mfaAt)) {
        // pathname + search: a query (paginacao, filtros) sobrevive ao challenge;
        // a pagina de challenge sanitiza o valor (sanitizeAdminRedirectTo).
        const challengeUrl = new URL(MFA_CHALLENGE_PATH, request.url);
        challengeUrl.searchParams.set('redirectTo', pathname + search);
        const res = NextResponse.redirect(challengeUrl, { status: 307 });
        return addSecurityHeaders(res, correlationId);
      }
    }

    const extraHeaders: Record<string, string> = { 'x-request-id': correlationId };
    if (isPublicLandingPath(pathname)) {
      extraHeaders['x-landing-locale'] = resolveLandingLocaleFromRequest(request);
    }
    return addSecurityHeaders(nextWithStripped(request, extraHeaders), correlationId);
  }

  // ─── Rate limiting (skip webhooks Stripe) ─────────────────────────────────
  if (!pathname.startsWith('/api/v1/webhooks/')) {
    const ip = getClientIp(request);
    let limitConfig: RateLimitConfig = RATE_LIMITS.GENERAL;
    let limitKey = `general:${ip}`;

    if (pathname === '/api/v1/auth/login') {
      limitConfig = RATE_LIMITS.AUTH_LOGIN;
      limitKey = `login:${ip}`;
    } else if (pathname === '/api/v1/auth/forgot-password') {
      limitConfig = RATE_LIMITS.AUTH_FORGOT;
      limitKey = `forgot:${ip}`;
    } else if (pathname === '/api/v1/auth/register') {
      limitConfig = RATE_LIMITS.AUTH_REGISTER;
      limitKey = `register:${ip}`;
    } else if (pathname === '/api/v1/auth/resend-confirmation') {
      limitConfig = RATE_LIMITS.AUTH_RESEND;
      limitKey = `resend-confirm:${ip}`;
    }

    const result = await checkRateLimit(limitKey, limitConfig);
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      const res = NextResponse.json(
        { error: 'Too many requests', code: 'RATE_001' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limitConfig.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        },
      );
      return addSecurityHeaders(res, correlationId);
    }
  }

  // ─── Allow public API paths without auth ──────────────────────────────────
  const isPublic = PUBLIC_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isPublic) {
    return addSecurityHeaders(
      nextWithStripped(request, { 'x-request-id': correlationId }),
      correlationId,
    );
  }

  // ─── Verify JWT ───────────────────────────────────────────────────────────
  const payload = getPayloadFromRequest(request);
  if (!payload) {
    const res = NextResponse.json(
      apiResponse(null, 'Não autorizado. Faça login para continuar.'),
      { status: 401 },
    );
    return addSecurityHeaders(res, correlationId);
  }

  // ─── Admin-only paths ─────────────────────────────────────────────────────
  const isAdminOnly = ADMIN_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isAdminOnly && payload.role !== UserRole.ADMIN) {
    const res = NextResponse.json(
      apiResponse(null, 'Acesso restrito a administradores.'),
      { status: 403 },
    );
    return addSecurityHeaders(res, correlationId);
  }

  // ─── Forward user context to route handlers via headers ───────────────────
  // nextWithStripped already removed any client-supplied internal headers;
  // we now set them from the verified JWT payload only.
  return addSecurityHeaders(
    nextWithStripped(request, {
      'x-request-id': correlationId,
      'x-user-id': payload.sub,
      'x-user-role': payload.role,
      'x-token-version': String(payload.version),
    }),
    correlationId,
  );
}

export const config = {
  matcher: [
    // Apply to all routes except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
