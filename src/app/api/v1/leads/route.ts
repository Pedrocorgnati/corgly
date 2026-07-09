import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { LeadSubmitSchema, LEAD_HONEYPOT_FIELD } from '@/lib/leads/lead.schema';

/**
 * POST /api/v1/leads  (T-053 / §12.4.3)
 *
 * Captação pública de leads vinda de TRÊS origens (landing, método, contato)
 * para o MESMO endpoint. Sem autenticação por design.
 *
 * Defesas do formulário público:
 *   1. Rate limit por (IP + user-agent) — 5 req / 1 min (fail-open se Redis off).
 *   2. Honeypot (`website`) — bots que preenchem o campo isca são gravados como
 *      SPAM mas recebem 200 silencioso (não vaza a heurística).
 *   3. Captcha OPCIONAL (Cloudflare Turnstile) — verificado apenas quando
 *      `TURNSTILE_SECRET_KEY` está configurado; ausente => no-op.
 *
 * Consentimento de marketing é EXPLÍCITO: `consentGiven` deve ser `true`,
 * caso contrário a validação rejeita (400). `consentAt` registra o momento.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Janela curta de deduplicação por (email + origem) para evitar floods/duplo-clique.
const DEDUP_WINDOW_MS = 60_000;
// spamScore >= threshold OU honeypotHit => lead nasce como SPAM (não vira NEW).
const SPAM_SCORE_THRESHOLD = 60;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** SHA-256 do IP com sal do ENCRYPTION_KEY — nunca persiste o IP cru (LGPD). */
function hashIp(ip: string): string | null {
  if (!ip || ip === 'unknown') return null;
  return createHash('sha256').update(`${ip}:${env.ENCRYPTION_KEY}`).digest('hex');
}

/** Fingerprint composto para a chave de rate limit (evita colidir buckets `unknown`). */
function buildRateLimitKey(request: NextRequest): string {
  const ip = getClientIp(request);
  const uaHash = createHash('sha256')
    .update(request.headers.get('user-agent') ?? 'no-ua')
    .digest('hex')
    .slice(0, 12);
  return `leads:submit:${ip}:${uaHash}`;
}

/** Heurística leve de spam 0..100 com base em conteúdo (links são o maior sinal). */
function computeSpamScore(name: string | undefined, message: string | undefined): number {
  let score = 0;
  const linkRe = /https?:\/\/|www\.|\[url=|<a\s/gi;
  const text = `${name ?? ''} ${message ?? ''}`;
  const links = text.match(linkRe);
  if (links) score += Math.min(60, links.length * 25);
  if (name && /https?:\/\//i.test(name)) score += 30; // URL no nome é forte sinal de bot
  if (message && /\b(viagra|casino|crypto airdrop|seo backlinks)\b/i.test(message)) score += 40;
  return Math.min(100, score);
}

/** Verifica o token Turnstile. Retorna `true` quando captcha desabilitado (no-op). */
async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // captcha opcional não configurado => no-op
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    // Falha de rede no verificador => fail-closed para captcha (não derruba o lead silenciosamente).
    logger.error('[leads] Turnstile verify error', undefined, err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. Rate limit (fail-open quando Redis ausente).
  const rl = await checkRateLimit(buildRateLimitKey(request), RATE_LIMITS.LEADS_SUBMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde um momento e tente novamente.'),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 2. Body JSON.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'JSON inválido.'), { status: 400 });
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 400) ?? null;
  const honeypotRaw = (raw as Record<string, unknown> | null)?.[LEAD_HONEYPOT_FIELD];
  const honeypotHit = typeof honeypotRaw === 'string' && honeypotRaw.trim().length > 0;

  // 3. Validação de negócio (inclui consentimento explícito = true).
  const parsed = LeadSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    // Bot que tropeçou no honeypot mas mandou payload inválido: responde sucesso silencioso.
    if (honeypotHit) return NextResponse.json(apiResponse({ received: true }), { status: 200 });
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 4. Honeypot: grava como SPAM e devolve 200 silencioso (não revela a defesa).
  if (honeypotHit) {
    try {
      await prisma.lead.create({
        data: {
          origin: data.origin,
          email: data.email,
          name: data.name ?? null,
          message: data.message ?? null,
          locale: data.locale,
          consentGiven: data.consentGiven,
          consentAt: new Date(),
          status: 'SPAM',
          ipHash: hashIp(ip),
          userAgent,
          honeypotHit: true,
          spamScore: 100,
        },
      });
    } catch (err) {
      logger.error('[leads] honeypot persist error', undefined, err);
    }
    return NextResponse.json(apiResponse({ received: true }), { status: 200 });
  }

  // 5. Captcha opcional.
  const captchaOk = await verifyCaptcha(data.captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      apiResponse(null, 'Falha na verificação anti-bot. Recarregue a página e tente novamente.'),
      { status: 400 },
    );
  }

  // 6. Dedup em janela curta por (email + origem).
  try {
    const recent = await prisma.lead.findFirst({
      where: {
        email: data.email,
        origin: data.origin,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      // Idempotente: já registramos esse lead há instantes; trata como sucesso.
      return NextResponse.json(apiResponse({ received: true }), { status: 200 });
    }
  } catch (err) {
    logger.error('[leads] dedup lookup error', undefined, err);
  }

  // 7. Persistência.
  const spamScore = computeSpamScore(data.name, data.message);
  const status = spamScore >= SPAM_SCORE_THRESHOLD ? 'SPAM' : 'NEW';

  try {
    const lead = await prisma.lead.create({
      data: {
        origin: data.origin,
        email: data.email,
        name: data.name ?? null,
        message: data.message ?? null,
        locale: data.locale,
        consentGiven: data.consentGiven,
        consentAt: new Date(),
        status,
        ipHash: hashIp(ip),
        userAgent,
        honeypotHit: false,
        spamScore,
      },
      select: { id: true, status: true },
    });

    logger.info('[leads] captured', { origin: data.origin, status: lead.status, leadId: lead.id });

    return NextResponse.json(
      apiResponse({ received: true }, null, 'Recebemos seu contato. Em breve retornaremos.'),
      { status: 201 },
    );
  } catch (err) {
    logger.error('[leads] persist error', { origin: data.origin }, err);
    return NextResponse.json(
      apiResponse(null, 'Não foi possível enviar agora. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
