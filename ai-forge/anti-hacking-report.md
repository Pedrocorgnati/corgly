# Anti-Hacking Review Report — Corgly
Data: 2026-03-22
Projeto: Corgly (plataforma de sessões de coaching online)
Fingerprint: Next.js 16.2.1 | React 19.2.4 | Node.js 24.11.1 | Prisma 5.x | MySQL

---

## Resumo Executivo

| Severidade     | Total |
|----------------|-------|
| P0-BLOCKER     | 1     |
| P1-CRÍTICO     | 2     |
| P2-ALTO        | 1     |
| P3-MÉDIO       | 3     |
| P4-BAIXO       | 3     |
| **Total**      | **10** |

- **CVEs aplicáveis ao projeto**: 1 (CVE-2025-59466 via Node.js 24.11.1)
- **CVEs não aplicáveis**: 7 de 8 (Next.js 16.2.1 e React 19.2.4 são versões patchadas)
- **Attack chains identificadas**: 2
- **npm audit**: 0 vulnerabilidades
- **Risco geral**: CRÍTICO (V001 escalada para P0/BLOCKER — bypass de middleware cobre todas as subrotas admin sob /content e /availability)

---

## CVEs Verificados

| CVE | CVSS | Descrição | Afeta Projeto? |
|-----|------|-----------|----------------|
| CVE-2025-29927 | 9.1 | Middleware bypass via `x-middleware-subrequest` | ❌ NÃO — Afeta ≤15.2.2, projeto usa 16.2.1 |
| CVE-2025-55182 (React2Shell) | 10.0 | RCE via deserialização RSC Flight | ❌ NÃO — Afeta React 19.0.0–19.2.0, projeto usa 19.2.4 |
| CVE-2025-55184 | 7.5 | DoS via recursão infinita de Promises no RSC | ❌ NÃO — Afeta React ≤19.2.3, projeto usa 19.2.4 |
| CVE-2025-49826 | 7.5 | Cache poisoning via ISR + resposta 204 | ❌ NÃO — Afeta ≤15.1.7 |
| CVE-2025-49005 | 3.7 | Cache poisoning via redirect/rewrite | ❌ NÃO — Afeta ≤15.3.3 |
| CVE-2025-55183 | 5.3 | Disclosure de source code de Server Actions | ❌ NÃO — Patchado em 16.0.10, projeto usa 16.2.1 |
| CVE-2025-57822 | 6.5 | SSRF via header Location no middleware | ❌ NÃO — Afeta ≤15.4.6 |
| CVE-2024-34351 | 7.5 | SSRF via header Host em Server Actions | ❌ NÃO — Afeta ≤14.1.0 |
| CVE-2025-59466 | 7.5 | Node.js DoS via stack exhaustion em async_hooks | ⚠️ **SIM** — Node.js 24.11.1 < 24.13.0 |

---

## Vulnerabilidades Detalhadas

### V001 — Header Injection em Endpoints Admin de Caminhos Públicos (P0-BLOCKER)

> ⚠️ **Escalado de P1-CRÍTICO para P0-BLOCKER pelo Codex** — O escopo é maior do que inicialmente avaliado: TODAS as subrotas sob `/api/v1/content/*` e `/api/v1/availability/*` são afetadas, incluindo operações destrutivas como DELETE, PATCH, block, unblock e notes.

**Descrição:**
Dois endpoints `POST` com acesso restrito a admin estão em caminhos declarados como `PUBLIC_API_PATHS` no middleware:
- `POST /api/v1/content`
- `POST /api/v1/availability`

Quando o middleware processa requisições para esses caminhos, chama `NextResponse.next()` **sem** verificar JWT e **sem** sobrescrever os headers `x-user-id`, `x-user-role`, `x-token-version`. Isso significa que os headers fornecidos pelo cliente passam diretamente para o route handler.

Os handlers chamam `requireAdmin(request)` (de `src/lib/auth-guard.ts`) que lê esses headers e valida o `tokenVersion` contra o banco de dados. Embora a verificação de DB forneça proteção parcial, o design cria uma inconsistência de segurança: esses endpoints dependem inteiramente da validação no nível do handler em vez de ter o middleware como linha de defesa primária.

**Arquivo:** `src/middleware.ts:6-18` (PUBLIC_API_PATHS) + `src/app/api/v1/content/route.ts:24-27` + `src/app/api/v1/availability/route.ts:28-31`

**Como explorar:**
1. Obter o ID de um usuário admin (via enumeração ou dados vazados)
2. Tentar `tokenVersion = 0` (valor inicial, válido para admins que nunca resetaram senha)
3. Enviar request com headers injetados:
   ```
   POST /api/v1/content
   x-user-id: <admin-user-id>
   x-user-role: ADMIN
   x-token-version: 0
   Content-Type: application/json

   {"title":"Injected","body":"...","language":"PT_BR"}
   ```
4. Se `tokenVersion` for correto, o handler aceita a requisição como admin válido.

**Impacto:** Injeção de conteúdo da plataforma, criação de disponibilidade não autorizada.

**Fix (ANTES vs DEPOIS):**

ANTES — `/src/middleware.ts`:
```typescript
const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  // ...
  '/api/v1/content',       // ← inclui POST admin
  '/api/v1/availability',  // ← inclui POST admin
];
```

DEPOIS — remover os caminhos mistos da lista pública e tratar granularidade por método no handler:
```typescript
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
  // GET público tratado pelos próprios handlers com autenticação opcional
];
```

E nos handlers, verificar o método:
```typescript
// GET /api/v1/content — público (sem auth)
export async function GET(request: NextRequest) { ... }

// POST /api/v1/content — admin apenas (middleware já protege com JWT)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request); // agora x-user-* vêm do JWT verificado
  if (auth instanceof NextResponse) return auth;
  // ...
}
```

**Teste de validação:** Tentar POST sem token retorna 401. POST com token de não-admin retorna 403. POST com header `x-user-role: ADMIN` sem cookie/token retorna 401 do middleware.

---

### V002 — CVE-2025-59466: Node.js DoS via Stack Exhaustion (P2-ALTO)

**Descrição:**
Node.js 24.11.1 é vulnerável ao CVE-2025-59466. Quando `AsyncLocalStorage` (usado pelo Next.js App Router internamente) está ativo e um payload causa stack exhaustion, o Node.js chama `process.exit(7)` em vez de lançar um erro capturável. O processo encerra imediatamente sem possibilidade de recovery.

**CVSS:** 7.5 High
**Afeta:** Node.js < 24.13.0 (e < 20.20.0, < 22.22.0)

**Como explorar:**
Enviar payload JSON profundamente aninhado (>10000 níveis) para qualquer endpoint que parseia JSON:
```bash
python3 -c "
d = '{}'
for i in range(15000):
    d = '{\"a\":' + d + '}'
import requests
requests.post('https://corgly.app/api/v1/auth/login', data=d, headers={'Content-Type':'application/json'})
"
```

**Impacto:** Crash total do processo Node.js, downtime imediato.

**Fix:** Atualizar Node.js para 24.13.0+ no Dockerfile e na imagem de produção.

**Arquivo:** `Dockerfile` (verificar versão base da imagem Node.js)

---

### V003 — Rate Limit IP Spoofing via X-Forwarded-For (P2-ALTO)

**Descrição:**
O nginx usa `proxy_add_x_forwarded_for` (`nginx.conf:48`) que **acrescenta** o IP real após qualquer `X-Forwarded-For` fornecido pelo cliente. O middleware lê o **primeiro** IP do header para rate limiting:

```typescript
// src/middleware.ts:26-30
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ?? 'unknown'
  );
}
```

Um atacante que envia `X-Forwarded-For: 1.2.3.4` terá o header propagado como `X-Forwarded-For: 1.2.3.4, <real-ip>`. O middleware lê `1.2.3.4` — um IP spoofado — como chave de rate limit, tornando o rate limiting ineficaz.

**Arquivo:** `nginx.conf:48` + `src/middleware.ts:26-30`

**Como explorar:** Bypass total do rate limit em `/api/v1/auth/login` (brute force de senhas):
```bash
for i in $(seq 1 1000); do
  curl -H "X-Forwarded-For: $RANDOM.$RANDOM.$RANDOM.$RANDOM" \
    -X POST https://corgly.app/api/v1/auth/login \
    -d '{"email":"victim@example.com","password":"guess'$i'"}'
done
```

**Impacto:** Bypass de rate limit em auth, brute force de credenciais, spam de forgot-password.

**Fix (ANTES vs DEPOIS):**

ANTES — `nginx.conf:48`:
```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

DEPOIS — usar apenas o IP real do cliente:
```nginx
proxy_set_header X-Forwarded-For $remote_addr;  # ou remover e usar apenas X-Real-IP
```

E no middleware, priorizar `X-Real-IP` (confiável, definido pelo nginx):
```typescript
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ??           // confiável: definido pelo nginx com $remote_addr
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}
```

---

### V004 — CSP `script-src 'unsafe-inline'` em Produção (P3-MÉDIO)

**Descrição:**
O `next.config.ts` define `script-src 'self' 'unsafe-inline'` em produção. Isso permite execução de qualquer `<script>` inline, reduzindo significativamente a eficácia do CSP contra XSS refletido ou stored.

**Arquivo:** `next.config.ts:9`

**Fix:** Usar `nonce` ou `hash` em vez de `unsafe-inline`:
```typescript
// Gerar nonce por requisição via middleware e injetá-lo no CSP
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
const scriptSrc = `script-src 'self' 'nonce-${nonce}'`;
// Passar nonce via header para o layout usar em <script nonce={nonce}>
```

---

### V005 — JWT Algorithm Não Especificado Explicitamente (P3-MÉDIO)

**Descrição:**
`jwt.sign()` não especifica `algorithm`, usando o default `HS256`. Embora HS256 seja seguro, a falta de especificação explícita é uma falha de hardening — se o `JWT_SECRET` fosse por algum motivo uma chave pública RSA (erro de configuração), a verificação poderia ser burlada via `algorithm: none` em implementações vulneráveis da biblioteca.

**Arquivo:** `src/lib/auth.ts:18`

**ANTES:**
```typescript
return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
```

**DEPOIS:**
```typescript
return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any, algorithm: 'HS256' });
```

---

### V006 — HSTS Inconsistente entre Middleware e next.config.ts (P3-MÉDIO)

**Descrição:**
O `next.config.ts` define HSTS corretamente com `preload`:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Mas a função `addSecurityHeaders()` no middleware (`src/middleware.ts:37`) define:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
(sem `preload`)

Para respostas de API (que passam pelo middleware), o header do middleware pode prevalecer, potencialmente afetando navegadores que usam esse header para HSTS preloading.

**Fix:** Adicionar `; preload` ao HSTS do middleware:
```typescript
// src/middleware.ts:37
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
```

---

### V007 — `poweredByHeader: false` Ausente (P4-BAIXO)

**Descrição:**
O `next.config.ts` não define `poweredByHeader: false`. O Next.js por padrão adiciona `X-Powered-By: Next.js` nas respostas, revelando a tecnologia usada a atacantes.

**Fix:**
```typescript
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // ...
};
```

---

### V008 — `dangerouslySetInnerHTML` para CSS Inline (P4-BAIXO)

**Descrição:**
`TiptapEditor.tsx` e `AudioOnlyOverlay.tsx` usam `dangerouslySetInnerHTML` para injetar CSS de animação inline. Atualmente seguro pois usa constantes hardcoded. Padrão arriscado se refatorado para aceitar valores externos.

**Arquivos:**
- `src/components/session/TiptapEditor.tsx:125`
- `src/components/session/AudioOnlyOverlay.tsx:43`

**Recomendação:** Migrar para CSS Modules ou Tailwind keyframes para eliminar o padrão.

---

### V009 — `console.error` em Route Handler Admin (P4-BAIXO)

**Descrição:**
`src/app/api/v1/admin/dashboard/route.ts:117` usa `console.error('GET /admin/dashboard', err)` que pode logar stack traces com dados sensíveis (queries SQL, IDs de usuários) em logs de produção sem sanitização.

**Fix:** Substituir por `logger.error()` (já existe `src/lib/logger.ts`) com contexto controlado:
```typescript
logger.error('GET /api/v1/admin/dashboard', { action: 'admin.dashboard' }, err);
```

---

## Attack Chains

### Attack Chain 1: Admin Content Injection
1. Atacante enumera emails registrados via `/api/v1/auth/register` (resposta diferente para email existente vs novo)
2. Tenta logar com senha conhecida ou bruta para obter user ID admin do JWT decodificado
3. Alternativamente: ID de admin pode ser obtido via qualquer endpoint que retorne informações de sessão (ex: `/api/v1/sessions/[id]` retorna `studentId` e `adminId`)
4. Com `userId` admin + `tokenVersion: 0`, injeta headers em `POST /api/v1/content`
5. Cria conteúdo malicioso visível a todos os estudantes da plataforma

**Complexidade:** Média (requer obter admin userId + tokenVersion)
**Impacto:** Injeção de conteúdo malicioso para todos os usuários

### Attack Chain 2: Auth Brute Force via Rate Limit Bypass
1. Atacante rotaciona `X-Forwarded-For` headers com IPs aleatórios (V003)
2. Bypassa rate limit de auth (RATE_LIMITS.AUTH_LOGIN)
3. Realiza brute force de senha contra contas conhecidas
4. Com credenciais válidas, obtém JWT e acessa sistema como usuário legítimo
5. Se conta for admin: acesso total ao dashboard

**Complexidade:** Baixa (automatizável com 5 linhas de código)
**Impacto:** Comprometimento de contas, acesso não autorizado a dados de estudantes

---

## Supply Chain

- **npm audit**: 0 vulnerabilidades em todas as dependências
- **package-lock.json**: presente e versionado
- **Scripts pós-install**: nenhum suspeito detectado
- **Lock file**: commitado corretamente

---

## Headers de Segurança

| Header | next.config.ts | Middleware | Status |
|--------|----------------|------------|--------|
| Content-Security-Policy | ✅ | ❌ Ausente | Parcial (apenas páginas, não API responses) |
| X-Frame-Options | ✅ DENY | ✅ DENY | ✅ OK |
| X-Content-Type-Options | ✅ nosniff | ✅ nosniff | ✅ OK |
| Strict-Transport-Security | ✅ com preload | ⚠️ sem preload | ⚠️ Inconsistente |
| Referrer-Policy | ✅ | ✅ | ✅ OK |
| Permissions-Policy | ✅ | ✅ | ✅ OK |
| X-XSS-Protection | ❌ Ausente | ❌ Ausente | ⚠️ Ausente (deprecated mas ainda útil) |
| X-Powered-By | ⚠️ Não desabilitado | N/A | ⚠️ Exposto |

---

## Compliance (PCI DSS 4.0)

O projeto processa pagamentos via Stripe. Verificações relevantes:

- **Scripts de terceiros em páginas de checkout**: Stripe.js carregado via CSP whitelist (`frame-src https://js.stripe.com`) — ✅
- **Formulários de cartão**: Usando Stripe hosted fields (Checkout Session), não campos customizados — ✅
- **Subresource Integrity (SRI)**: Não detectado para scripts externos — ⚠️ Recomendado
- **Assinatura de webhook**: Implementada corretamente via `stripe.webhooks.constructEvent()` — ✅
- **Dados de cartão não armazenados**: Confirmado — ✅

---

## Fontes Pesquisadas

- https://nvd.nist.gov/vuln/detail/CVE-2025-29927
- https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass
- https://www.wiz.io/blog/critical-vulnerability-in-react-cve-2025-55182
- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
- https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components
- https://nextjs.org/blog/security-update-2025-12-11
- https://vercel.com/changelog/cve-2025-49826
- https://github.com/advisories/GHSA-4342-x723-ch2f
- https://www.assetnote.io/resources/research/advisory-next-js-ssrf-cve-2024-34351
- https://nodejs.org/en/blog/vulnerability/january-2026-dos-mitigation-async-hooks
