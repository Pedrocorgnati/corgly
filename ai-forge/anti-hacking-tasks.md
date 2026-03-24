# Anti-Hacking Tasks — Corgly
Data: 2026-03-22

---

## P1-CRÍTICO (Fix antes do deploy)

### T001 — Remover endpoints admin de PUBLIC_API_PATHS no middleware

**ID:** V001
**Arquivo:** `src/middleware.ts`

**Problema:** `POST /api/v1/content` e `POST /api/v1/availability` são declarados como públicos no middleware, permitindo que atacantes injetem `x-user-id`/`x-user-role`/`x-token-version` headers diretamente.

**Fix:**
```typescript
// src/middleware.ts — remover as duas últimas entradas
const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/confirm-email',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/resend-confirmation',
  '/api/v1/auth/cancel-deletion',
  '/api/v1/auth/cookie-consent',
  '/api/v1/webhooks/stripe',
  // REMOVIDOS: '/api/v1/content' e '/api/v1/availability'
];
```

Os GETs públicos (content e availability) continuam funcionando porque o middleware verifica JWT e retorna 401 apenas para paths não-públicos — mas os handlers não lêem `x-user-id` nos GETs (apenas fazem consulta sem auth), então continuarão funcionando após autenticação JWT ser verificada.

**Atenção:** Verificar se o GET de `/api/v1/content` e `/api/v1/availability` genuinamente precisa ser acessível sem token. Se sim, adicionar lógica no middleware para permitir GET sem auth mas exigir JWT para outros métodos, ou mover essa verificação para os handlers. A solução mais simples é que, após remover da lista pública, os GETs retornarão 401 para usuários não logados — o frontend precisará passar o token.

**Alternativa mais granular (se GET precisa ser público):**
```typescript
// No middleware, após a verificação de caminhos públicos, adicionar:
// Permitir GET em availability e content sem auth
if (
  (pathname === '/api/v1/content' || pathname.startsWith('/api/v1/content/')) &&
  request.method === 'GET'
) {
  return addSecurityHeaders(NextResponse.next());
}
if (
  (pathname === '/api/v1/availability' || pathname.startsWith('/api/v1/availability/')) &&
  request.method === 'GET'
) {
  return addSecurityHeaders(NextResponse.next());
}
```

**Teste de validação:**
```bash
# Deve retornar 401 (JWT necessário, header injetado ignorado)
curl -X POST https://corgly.app/api/v1/content \
  -H "x-user-id: any-id" \
  -H "x-user-role: ADMIN" \
  -H "x-token-version: 0" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Esperado: 401

# GET ainda deve funcionar (se mantido público por método)
curl https://corgly.app/api/v1/content
# Esperado: 200 com lista de conteúdos
```

**Estimativa:** 30 minutos

---

## P2-ALTO (Fix em 48h)

### T002 — Atualizar Node.js para 24.13.0+ (CVE-2025-59466)

**ID:** V002 / CVE-2025-59466
**Arquivo:** `Dockerfile`

**Problema:** Node.js 24.11.1 é vulnerável ao CVE-2025-59466. Stack exhaustion via payload aninhado derruba o processo com `process.exit(7)` irrecuperável.

**Fix:** Atualizar a imagem base no Dockerfile:
```dockerfile
# ANTES
FROM node:24.11-alpine AS base

# DEPOIS
FROM node:24-alpine AS base  # ou node:24.13-alpine quando disponível
# Verificar: node:24.14-alpine ou node:24-alpine (latest 24.x)
```

**Verificação pós-fix:**
```bash
docker build -t corgly:test . && docker run corgly:test node --version
# Esperado: v24.13.0 ou superior
```

**Estimativa:** 15 minutos

---

### T003 — Corrigir Rate Limit IP Spoofing no nginx + middleware

**ID:** V003
**Arquivos:** `nginx.conf` + `src/middleware.ts`

**Problema:** `proxy_add_x_forwarded_for` permite que clientes injetem IPs falsos no início do header `X-Forwarded-For`, bypassando rate limiting.

**Fix nginx.conf:**
```nginx
# ANTES (linha 48)
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

# DEPOIS — IP real do cliente, não manipulável
proxy_set_header X-Forwarded-For $remote_addr;
```

**Fix middleware.ts:**
```typescript
// ANTES (src/middleware.ts:26-30)
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// DEPOIS — priorizar X-Real-IP (não spoofável via nginx)
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown'
  );
}
```

**Nota:** Se usar CDN na frente do nginx no futuro, revisar esta lógica novamente.

**Teste de validação:**
```bash
# Tentar spoofar IP — rate limit deve aplicar ao IP real
for i in $(seq 1 10); do
  curl -H "X-Forwarded-For: 8.8.8.8" \
    -X POST https://corgly.app/api/v1/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}' 2>&1 | grep -E "429|200"
done
# A partir do ~6º request, deve retornar 429
```

**Estimativa:** 30 minutos

---

## P3-MÉDIO (Próximo sprint)

### T004 — Remover `script-src 'unsafe-inline'` do CSP de produção

**ID:** V004
**Arquivo:** `next.config.ts`

**Fix:** Implementar nonce-based CSP via middleware:
```typescript
// src/middleware.ts — adicionar geração de nonce para pages
import { randomBytes } from 'crypto';

// Na função middleware, para rotas de página (não API):
const nonce = randomBytes(16).toString('base64');
const cspWithNonce = `script-src 'self' 'nonce-${nonce}'`;

// Definir header com nonce e passar nonce via response header para o layout
requestHeaders.set('x-nonce', nonce);
```

**Nota:** Requer também atualizar `_document.tsx` ou layout para usar `nonce` em tags `<script>`. Avaliar compatibilidade com next-intl e framer-motion.

**Estimativa:** 2 horas

---

### T005 — Especificar algoritmo JWT explicitamente

**ID:** V005
**Arquivo:** `src/lib/auth.ts:18`

```typescript
// ANTES
return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });

// DEPOIS
return jwt.sign(payload, JWT_SECRET, {
  expiresIn: JWT_EXPIRES_IN as any,
  algorithm: 'HS256',
});
```

E na verificação:
```typescript
// src/lib/auth.ts:22
export function verifyJWT(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}
```

**Estimativa:** 15 minutos

---

### T006 — Corrigir HSTS inconsistente no middleware

**ID:** V006
**Arquivo:** `src/middleware.ts:37`

```typescript
// ANTES
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

// DEPOIS
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
```

**Estimativa:** 5 minutos

---

## P4-BAIXO (Backlog)

### T007 — Adicionar `poweredByHeader: false`

**ID:** V007
**Arquivo:** `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  // ...
};
```

**Estimativa:** 5 minutos

---

### T008 — Migrar CSS inline de `dangerouslySetInnerHTML` para Tailwind keyframes

**ID:** V008
**Arquivos:** `src/components/session/TiptapEditor.tsx:125`, `src/components/session/AudioOnlyOverlay.tsx:43`

Mover os keyframes CSS para `globals.css` ou definir animações via Tailwind config.

**Estimativa:** 1 hora

---

### T009 — Substituir `console.error` por `logger.error` no admin dashboard

**ID:** V009
**Arquivo:** `src/app/api/v1/admin/dashboard/route.ts:117`

```typescript
// ANTES
console.error('GET /admin/dashboard', err);

// DEPOIS
import { logger } from '@/lib/logger';
logger.error('GET /api/v1/admin/dashboard', { action: 'admin.dashboard' }, err);
```

**Estimativa:** 5 minutos

---

## Ordem Recomendada de Execução

```
1. T001 — Header injection PUBLIC_API_PATHS (P1, bloqueador de segurança)
2. T002 — Node.js upgrade (P2, CVE com patch disponível, 15 min)
3. T003 — Rate limit IP spoofing nginx + middleware (P2, auth brute force risk)
4. T005 — JWT algorithm explícito (P3, 15 min)
5. T006 — HSTS preload no middleware (P3, 5 min)
6. T007 — poweredByHeader: false (P4, 5 min)
7. T009 — console.error → logger.error (P4, 5 min)
8. T008 — dangerouslySetInnerHTML CSS (P4, 1h)
9. T004 — CSP nonce (P3, 2h — mais complexo, avaliar impacto no DX)
```
