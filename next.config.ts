import path from 'node:path';
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const isDev = process.env.NODE_ENV === 'development';

// O Content-Security-Policy NAO mora aqui: ele precisa de um nonce novo por
// requisicao e e montado no proxy (src/lib/security/csp.ts). Um CSP estatico
// neste arquivo seria enviado junto e o navegador aplicaria os dois, ou seja,
// o `script-src 'self'` daqui voltaria a bloquear os scripts inline do Next.
const securityHeaders = [
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
        // /ebooks/acesso/* fica fora: a URL carrega o token de acesso ao PDF e
        // exige `Referrer-Policy: no-referrer` (D7, task-007 do loop de ebooks).
        source: '/((?!ebooks/acesso/).*)',
        headers: securityHeaders,
      },
      {
        source: '/ebooks/acesso/:path*',
        headers: securityHeaders.map((header) =>
          header.key === 'Referrer-Policy' ? { key: header.key, value: 'no-referrer' } : header,
        ),
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
