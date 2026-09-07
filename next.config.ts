import path from 'node:path';
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const isDev = process.env.NODE_ENV === 'development';

// unsafe-eval necessário para Next.js HMR em dev; removido em produção.
// unsafe-inline removido em produção — Next.js 15 não requer scripts inline.
// Se um terceiro exigir inline, use nonce ou hash em vez de unsafe-inline.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
  : "script-src 'self'";

const ContentSecurityPolicy = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' https://fonts.gstatic.com",
  // wss para Hocuspocus (module-7) + Stripe
  "connect-src 'self' wss://collab.corgly.app https://api.stripe.com",
  // YouTube para embeds (module-8) + Stripe
  "frame-src 'self' https://www.youtube.com https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

// Identificador unico por build. O Next anexa `?dpl=<id>` a TODA URL de asset
// estatico (CSS, JS, imagens, fontes), o que troca a chave de cache do CDN a
// cada deploy.
//
// Por que isso existe: em 2026-09-07 a home de corgly.app renderizou sem
// nenhum estilo. A causa NAO era o Tailwind — o chunk
// /_next/static/chunks/09b_52gqoyc~-.css estava integro na origem (LiteSpeed,
// 135166 bytes, md5 identico ao build local), mas a borda da Cloudflare servia
// uma entrada de cache com CORPO VAZIO (cf-cache-status: HIT, 0 bytes) para
// aquela mesma URL. Como o asset vai com
// `cache-control: public, max-age=31536000, immutable`, a entrada envenenada
// duraria um ano. A mesma URL com query string de cache-busting devolvia os
// 135166 bytes corretos.
//
// Com `deploymentId`, um redeploy sempre estreia URLs novas, entao uma entrada
// envenenada na borda nunca sobrevive ao proximo deploy. Isso NAO substitui o
// purge do cache quando o problema ja esta em producao.
//
// Em multi-instancia, todas as instancias do MESMO deploy precisam do mesmo id:
// use NEXT_DEPLOYMENT_ID no build (ex.: o SHA do commit) em vez do fallback.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID?.trim() || `b${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  // Raiz explicita do Turbopack. Sem isso, o Next infere a raiz pelo lockfile
  // mais alto (/home/pedro/package-lock.json) e os idents de chunk passam a
  // conter o caminho acentuado do repo, o que faz o Turbopack panicar em
  // ident.rs ("byte index is not a char boundary").
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Cache-busting de assets por deploy — ver o comentario em `deploymentId`.
  deploymentId,
  reactStrictMode: true,
  output: 'standalone',
  // Removes X-Powered-By header to prevent technology fingerprinting (A05)
  poweredByHeader: false,
  // SEO: No trailing slash — /about vs /about/
  trailingSlash: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.corgly.app',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // ISR cache headers for landing page
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// ─── Sentry (producao apenas) ─────────────────────────────────────────────
// withSentryConfig tenta ler manifestos de build que nao existem em dev,
// o que quebra o HMR. Por isso aplicamos o wrapper apenas quando nao e dev.
// Require() e guardado em try/catch para permitir que o projeto funcione
// antes do `npm i @sentry/nextjs` (ver PENDING-ACTIONS.md).
let finalConfig = withNextIntl(nextConfig);
if (!isDev && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { withSentryConfig } = require('@sentry/nextjs');
    finalConfig = withSentryConfig(finalConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      hideSourceMaps: true,
      disableLogger: true,
    });
  } catch {
    // @sentry/nextjs nao instalado — produz build sem monitoramento ate instalar
  }
}

export default finalConfig;
