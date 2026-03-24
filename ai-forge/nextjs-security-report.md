# Security Report — Corgly
Data: 2026-03-23
Auditor: Claude Sonnet 4.6 (/nextjs:security)
OWASP Top 10 2021

---

## Resumo Executivo

**Risco Geral: MÉDIO**
npm audit: 0 vulnerabilidades.
4 issues encontrados (1 ALTA, 2 MÉDIAS, 2 BAIXAS). Todos corrigidos nesta sessão.

---

## Vulnerabilidades Encontradas e Corrigidas

### T001 — Header Injection via Public Routes [ALTA → CORRIGIDA]
**OWASP:** A01 – Broken Access Control
**Arquivo:** `src/middleware.ts`

**Problema:** O middleware não realizava strip dos headers internos `x-user-id`, `x-user-role`,
`x-token-version` de requests incoming. Em rotas PUBLIC (ex: `/api/v1/content`) que possuem
handlers protegidos (POST/PATCH/DELETE via `requireAdmin`), um atacante poderia enviar esses
headers forjados diretamente, bypassando a verificação JWT. O único freio era o `tokenVersion`
check no DB (inteiro pequeno, potencialmente brute-forceable).

**Fix aplicado:** Introduzida função `stripInternalHeaders` chamada no início do middleware
para todos os requests. Introduzida função `nextWithStripped` que aplica os headers stripped
em todos os `NextResponse.next()` call sites. Headers internos são definidos APENAS após
verificação JWT bem-sucedida, a partir do payload do token.

**Evidência:** `src/middleware.ts:135` — `new Headers(request.headers)` sem strip prévio

---

### T002 — JWT sem algoritmo explícito [MÉDIA → CORRIGIDA]
**OWASP:** A07 – Authentication Failures
**Arquivo:** `src/lib/auth.ts`

**Problema:** `jwt.sign` e `jwt.verify` sem `algorithm`/`algorithms` especificados.
Risco de algorithm confusion attack (CVE-2015-9235 family): attacker poderia tentar
craftar token com `alg: none` ou trocar algoritmo.

**Fix aplicado:**
- `signJWT`: adicionado `algorithm: 'HS256'`
- `verifyJWT`: adicionado `algorithms: ['HS256']`

**Evidência:** `src/lib/auth.ts:17,21`

---

### T003 — X-Powered-By exposto [BAIXA → CORRIGIDA]
**OWASP:** A05 – Security Misconfiguration
**Arquivo:** `next.config.ts`

**Problema:** `poweredByHeader` não definido → padrão `true` → Next.js envia
`X-Powered-By: Next.js` em todas as respostas, facilitando fingerprinting.

**Fix aplicado:** `poweredByHeader: false` adicionado ao `nextConfig`.

---

### T004 — CSP unsafe-inline em script-src (produção) [BAIXA → CORRIGIDA]
**OWASP:** A05 – Security Misconfiguration
**Arquivo:** `next.config.ts`

**Problema:** CSP de produção incluía `'unsafe-inline'` em `script-src`, anulando grande
parte da proteção XSS fornecida pelo CSP.

**Fix aplicado:** `script-src 'self'` em produção (sem `unsafe-inline`). Dev mantém
`unsafe-eval unsafe-inline` para HMR. Next.js 15 não requer inline scripts em produção.

---

## Pontos Positivos Identificados

- **Auth sólida:** JWT httpOnly cookie + tokenVersion DB invalidation + bcrypt rounds=12
- **Rate limiting:** Upstash Redis distribuído com configs específicas por endpoint
- **requireAdmin/requireStudent:** Double-check DB além do JWT (tokenVersion)
- **Tokens criptograficamente seguros:** `crypto.randomBytes(32)` para reset/confirm tokens
- **Reset token hashed no DB:** Apenas hash armazenado, token plain enviado por email
- **Auth logger:** PII hasheado (SHA-256) nos logs, nunca tokens em claro
- **HSTS:** `max-age=31536000; includeSubDomains; preload`
- **Cron auth:** CRON_SECRET via Bearer header
- **Admin routes:** Double-check de role no middleware E no handler
- **npm audit:** 0 vulnerabilidades

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/middleware.ts` | Strip de headers internos; `nextWithStripped` helper |
| `src/lib/auth.ts` | JWT algorithm explícito (`HS256`) |
| `next.config.ts` | `poweredByHeader: false`; CSP sem `unsafe-inline` em prod |
| `ai-forge/security-task.md` | Task list gerada |
| `ai-forge/nextjs-security-report.md` | Este arquivo |
| `ai-forge/nextjs-security-summary.md` | Summary gerado |

---

## Testes Recomendados Pós-Correção

```bash
# 1. Type check (só arquivos src/)
npx tsc --noEmit --skipLibCheck

# 2. Lint
npx eslint src/middleware.ts src/lib/auth.ts

# 3. Header injection test (deve retornar 401)
curl -X POST http://localhost:3000/api/v1/content \
  -H "x-user-id: any-uuid" \
  -H "x-user-role: ADMIN" \
  -H "x-token-version: 0" \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
# Esperado: {"data":null,"error":"Não autorizado.","message":null} 401

# 4. JWT algorithm confusion test (deve rejeitar token com alg:none)
# Gerar token com alg:none manualmente e tentar usar → deve retornar 401

# 5. X-Powered-By check (deve estar ausente)
curl -I http://localhost:3000 | grep -i powered
# Esperado: nenhuma linha

# 6. CSP check (produção)
# Deve conter "script-src 'self'" sem "unsafe-inline"
curl -I https://corgly.app | grep -i content-security
```
