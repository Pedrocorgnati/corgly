# Anti-Hacking Fingerprint — Corgly
Data: 2026-03-22

## Runtime
- **Next.js**: 16.2.1
- **React**: 19.2.4 / 19.2.4 (react-dom)
- **Node.js**: 24.11.1 (host runtime)
- **Prisma**: 5.22.0 (ORM)
- **TypeScript**: 5.x

## Router
- **App Router** (`src/app/`) — Server Components + Client Components
- **Sem Pages Router**

## Auth
- Customizada com `jsonwebtoken` 9.0.3 + `bcryptjs` 3.0.3
- JWT armazenado em cookie `httpOnly` (corgly_token)
- Fallback: `Authorization: Bearer` para clientes de API
- tokenVersion para invalidação de sessão (password reset)
- Middleware injeta: `x-user-id`, `x-user-role`, `x-token-version`

## Payment
- **Stripe** 20.4.1 (Checkout Sessions + Subscriptions + Webhooks)
- Signature verification: `stripe.webhooks.constructEvent()`

## ORM / DB
- **Prisma + MySQL**
- `$queryRaw` e `$executeRaw` usam template literals (safe from SQLi)
- `$executeRawUnsafe` apenas em test/integration/setup.ts

## Deploy
- **Hostinger Cloud** — self-hosted via Docker + Nginx reverse proxy
- Domínio: corgly.app
- Collab (Hocuspocus WS): collab.corgly.app

## Middleware
- `src/middleware.ts` — auth JWT, rate limiting, security headers
- Matcher: tudo exceto `_next/static`, `_next/image`, favicon, imagens

## Server Actions
- 9 arquivos em `src/actions/` — todos STUBS (não implementados, throw errors)
- Zero lógica de negócio real em Server Actions por enquanto

## Features com Maior Superfície de Ataque
- Pagamentos (Stripe Checkout + Webhooks)
- Sala Virtual (WebRTC + Hocuspocus colaboração em tempo real)
- Agendamento (slots com lógica CAS transacional)
- Admin Dashboard (dados de todos os estudantes)

## Dependências de Segurança
- `lru-cache` para rate limiting in-memory (não distribuído)
- `jsonwebtoken` para JWT
- `bcryptjs` com salt rounds=12 para hashing de senha
- `zod` para validação de todos os inputs

## Supply Chain
- npm audit: **0 vulnerabilidades**
- package-lock.json presente e commitado
- Sem scripts postinstall/preinstall suspeitos
