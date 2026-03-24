# Security Task List — Corgly
Gerado: 2026-03-23
OWASP Top 10 2021 | Next.js 15 + React 19

---

### T001 - Strip internal trust headers de requests incoming

**Severidade:** ALTA
**OWASP:** A01 (Broken Access Control)
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/middleware.ts`

**Descrição:**
O middleware cria `new Headers(request.headers)` mantendo qualquer header que o cliente enviar,
depois faz `.set()` apenas para rotas autenticadas. Em rotas PUBLIC que possuem handlers protegidos
(ex: `POST /api/v1/content`), os headers `x-user-id`, `x-user-role` e `x-token-version` originados
do cliente chegam intactos até `requireAuth`, que os lê diretamente.

Um atacante com conhecimento de um UUID de admin válido pode enviar esses headers forjados e
tentar bypassar a verificação JWT — o único freio adicional é o check de `tokenVersion` no DB,
que é um inteiro pequeno (brute-forceable).

**Fix:** Antes de qualquer processamento, strip `x-user-id`, `x-user-role`, `x-token-version`
do request incoming para que apenas o middleware possa defini-los.

**Critérios de Aceite:**
- [ ] Headers internos removidos de toda request incoming no início do middleware
- [ ] Routes protegidas continuam funcionando com JWT válido
- [ ] Tentativa de forjar `x-user-id` resulta em 401

**Estimativa:** 0.5h

---

### T002 - JWT verify com algoritmo explícito

**Severidade:** MÉDIA
**OWASP:** A07 (Auth Failures)
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/auth.ts`

**Descrição:**
`jwt.verify(token, JWT_SECRET)` sem especificar `algorithms` é vulnerável ao ataque de
algorithm confusion: um atacante pode craftar um token com `alg: none` ou tentar trocar
o algoritmo. Mesmo que a biblioteca `jsonwebtoken` mitigue `alg: none` por padrão,
a ausência de `algorithms` array é uma má prática documentada (CVE-2015-9235 como referência).

`jwt.sign` também deve especificar `algorithm: 'HS256'` explicitamente.

**Critérios de Aceite:**
- [ ] `verifyJWT` especifica `algorithms: ['HS256']`
- [ ] `signJWT` especifica `algorithm: 'HS256'`
- [ ] Testes de auth passam

**Estimativa:** 0.25h

---

### T003 - Adicionar poweredByHeader: false

**Severidade:** BAIXA
**OWASP:** A05 (Security Misconfiguration)
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `next.config.ts`

**Descrição:**
`poweredByHeader` não definido → Next.js envia `X-Powered-By: Next.js` em todas as respostas,
expondo a tecnologia utilizada e facilitando fingerprinting por atacantes.

**Critérios de Aceite:**
- [ ] `poweredByHeader: false` em `nextConfig`
- [ ] `curl -I localhost:3000` não retorna `X-Powered-By`

**Estimativa:** 0.1h

---

### T004 - Remover unsafe-inline do CSP de produção

**Severidade:** BAIXA
**OWASP:** A05 (Security Misconfiguration)
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `next.config.ts`

**Descrição:**
CSP de produção contém `'unsafe-inline'` em `script-src`. Isso permite execução de qualquer
script inline, negando grande parte da proteção contra XSS que o CSP fornece.

O `'unsafe-inline'` em `style-src` é mais aceitável (estilo inline é comum no React),
mas em `script-src` é crítico.

**Fix:** Usar `nonce` ou `hash` para scripts inline necessários. O `'unsafe-eval'` já é
corretamente removido em produção; `'unsafe-inline'` deve seguir o mesmo.

**Nota:** Pode requerer refactor de scripts inline no código. Auditoria primeiro.

**Critérios de Aceite:**
- [ ] `script-src` de produção sem `'unsafe-inline'`
- [ ] App funciona sem erros de CSP no console
- [ ] CSP testada com `https://csp-evaluator.withgoogle.com/`

**Estimativa:** 1h

---

## Ordem de Execução

1. T001 (ALTA) — strip headers
2. T002 (MÉDIA) — JWT algorithm
3. T003 (BAIXA) — poweredByHeader
4. T004 (BAIXA) — CSP unsafe-inline

## Pós-correção: testes a executar
- `npm run lint`
- `npm run build`
- `npm run test` (unit)
- Testes de integração de auth: login, reset-password, admin routes
- `curl -H "x-user-id: fake" -H "x-user-role: ADMIN" -H "x-token-version: 0" http://localhost:3000/api/v1/content` → deve retornar 401
