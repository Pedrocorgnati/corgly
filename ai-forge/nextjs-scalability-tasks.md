# Scalability Tasks — Corgly

> Gerado por `/nextjs:scalability` em 2026-03-23
> Workspace: `output/workspace/corgly`

---

## T001 — Substituir rate limiter in-memory por Redis-backed (Upstash)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** CRÍTICA
**Arquivos:**
- modificar: `src/lib/rate-limit.ts`

**Descrição:**
`src/lib/rate-limit.ts` usa `new Map<string, RateLimitEntry>()` para rastrear hits por IP/userId.
Em múltiplas instâncias Vercel (serverless), cada instância tem seu próprio Map — limites são ineficazes e inconsistentes. O próprio comentário no código documenta: *"For production, replace with Redis-backed solution (e.g., @upstash/ratelimit)."*

Migrar para `@upstash/ratelimit` com driver Redis para estado distribuído real.

**Critérios de Aceite:**
- [ ] `store = new Map()` removido de `rate-limit.ts`
- [ ] `@upstash/ratelimit` + `@upstash/redis` instalados
- [ ] Limites preservados (AUTH_LOGIN, AUTH_REGISTER, AUTH_FORGOT, SESSIONS_CREATE, etc.)
- [ ] `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` adicionados ao `.env.example`
- [ ] Fallback gracioso se Redis indisponível (allow + log)
- [ ] Build sem erros

**Estimativa:** 2h

---

## T002 — Migrar signaling service in-memory para Redis pub/sub

**Tipo:** SEQUENTIAL
**Dependências:** T001 (Redis já configurado)
**Prioridade:** CRÍTICA
**Arquivos:**
- modificar: `src/services/signaling.service.ts`
- modificar: `src/app/api/v1/sessions/[id]/signal/route.ts` (se necessário)

**Descrição:**
`SignalingService` usa `private store = new Map<string, StoredSignal[]>()` — documentado como "single-server MVP".
Em múltiplas instâncias Vercel, offer/answer/candidate de um participante chegam em instância A mas o poll do outro participante vai para instância B → WebRTC nunca conecta.

Migrar para Redis como store compartilhado. O Redis já estará disponível após T001.

**Critérios de Aceite:**
- [ ] `private store = new Map()` removido de `signaling.service.ts`
- [ ] Signals armazenados em Redis com TTL de 1h (mantendo comportamento atual)
- [ ] `storeSignal`, `getSignals`, `clearSignals` funcionando via Redis
- [ ] Hard cap de MAX_SIGNALS_PER_KEY preservado (via LRANGE/LTRIM)
- [ ] Build e testes unitários passando

**Estimativa:** 3h

---

## T003 — Adicionar timeout por request no email service

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Prioridade:** ALTA
**Arquivos:**
- modificar: `src/services/email.service.ts`

**Descrição:**
O `fetch` para `https://api.resend.com/emails` em `email.service.ts:400` não tem `AbortSignal.timeout`.
O serviço tem retry com backoff exponencial (3 tentativas), mas se uma request trava (connection stall) pode bloquear o event loop por tempo indefinido, prendendo o worker serverless.

Adicionar `signal: AbortSignal.timeout(10_000)` (10s) em cada attempt.

**Critérios de Aceite:**
- [ ] `AbortSignal.timeout(10_000)` adicionado ao `fetch` dentro do loop de retry
- [ ] Erro de timeout é tratado como retryable (não interrompe o loop de retry)
- [ ] Build sem erros

**Estimativa:** 0.5h

---

## T004 — Adicionar circuit breaker no EmailService

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Prioridade:** ALTA
**Arquivos:**
- criar: `src/lib/circuit-breaker.ts`
- modificar: `src/services/email.service.ts`

**Descrição:**
`email.service.ts` chama Resend diretamente sem circuit breaker. Se o Resend ficar indisponível, todos os `fire-and-forget` vão falhar silenciosamente mas ainda tentam 3×, consumindo conexões.

Implementar circuit breaker simples (CLOSED/OPEN/HALF_OPEN) em `src/lib/circuit-breaker.ts` e aplicar no EmailService.

**Critérios de Aceite:**
- [ ] `circuit-breaker.ts` criado com estados CLOSED/OPEN/HALF_OPEN
- [ ] `failureThreshold: 5`, `timeout: 30_000`, `successThreshold: 2`
- [ ] EmailService wraps o `fetch` com o circuit breaker
- [ ] Build sem erros

**Estimativa:** 1.5h

---

## T005 — Configurar connection_limit no Prisma para serverless

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Prioridade:** ALTA
**Arquivos:**
- modificar: `.env.example`
- modificar: `src/lib/prisma.ts`

**Descrição:**
`src/lib/prisma.ts` cria `new PrismaClient()` sem configuração de pool. Em ambiente serverless (Vercel), cada instância cria conexões novas sem limite — com alto paralelismo pode esgotar o `max_connections` do MySQL.

Adicionar `connection_limit=5` na DATABASE_URL (padrão serverless) e documentar no `.env.example`.

**Critérios de Aceite:**
- [ ] `.env.example` documenta `?connection_limit=5` como sufixo recomendado para serverless
- [ ] `prisma.ts` adiciona `datasources.db.url` explícito ou documenta que a connection string controla o pool
- [ ] Graceful shutdown via `process.on('beforeExit')` adicionado em `prisma.ts`
- [ ] Build sem erros

**Estimativa:** 0.5h

---

## T006 — Migrar logs de services para usar `logger` centralizado

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** MÉDIA
**Arquivos:**
- modificar: `src/services/session.service.ts`
- modificar: `src/services/cron.service.ts`
- modificar: `src/services/auth.service.ts`
- modificar: `src/services/email.service.ts`
- modificar: `src/services/stripe.service.ts`
- modificar: `src/app/api/v1/sessions/[id]/feedback/route.ts`

**Descrição:**
Múltiplos arquivos de serviço usam `console.log/error/warn/info` diretamente em vez do módulo `src/lib/logger.ts`. O logger centralizado formata mensagens consistentemente e está pronto para integração com Sentry.

Substituir todas as chamadas `console.*` nos arquivos de service/route acima pelo `logger.*` correspondente.

**Critérios de Aceite:**
- [ ] Zero `console.log/error/warn/info` em arquivos de service (exceto dentro de `logger.ts` e `auth-logger.ts`)
- [ ] `import { logger } from '@/lib/logger'` adicionado onde necessário
- [ ] Contexto relevante preservado (sessionId, userId, etc.) nos logs
- [ ] Build sem erros

**Estimativa:** 1.5h

---

## T007 — Melhorar logger para emitir JSON estruturado em produção

**Tipo:** SEQUENTIAL
**Dependências:** T006
**Prioridade:** MÉDIA
**Arquivos:**
- modificar: `src/lib/logger.ts`

**Descrição:**
`src/lib/logger.ts` emite strings formatadas em dev e prod. Em produção, ferramentas de agregação de logs (Datadog, Logtail, etc.) esperam JSON para parsear campos automaticamente.

Alterar o logger para emitir JSON em produção (via `JSON.stringify`) e string legível em dev.

**Critérios de Aceite:**
- [ ] Em produção (`NODE_ENV=production`): `console.error(JSON.stringify({ level, message, ...context, timestamp }))`
- [ ] Em desenvolvimento: formato legível atual preservado
- [ ] `timestamp` incluído em todos os logs de produção
- [ ] Build sem erros

**Estimativa:** 0.5h

---

## T008 — Remover código deprecated de signals in-memory do SessionService

**Tipo:** PARALLEL-GROUP-1
**Dependências:** T002
**Prioridade:** BAIXA
**Arquivos:**
- modificar: `src/services/session.service.ts`

**Descrição:**
`session.service.ts` contém `private signals = new Map()` com métodos `postSignal`/`pollSignals` marcados `@deprecated`. O `signalingService` já foi migrado para Redis em T002. O código dead deve ser removido.

**Critérios de Aceite:**
- [ ] `private signals = new Map()` removido
- [ ] Métodos `postSignal` e `pollSignals` removidos
- [ ] Nenhuma referência a esses métodos em outros arquivos
- [ ] Build sem erros

**Estimativa:** 0.25h

---

## Status

| Task | Status | Observações |
|------|--------|-------------|
| T001 | [x] COMPLETED | `rate-limit.ts` → @upstash/ratelimit; middleware async |
| T002 | [x] COMPLETED | `signaling.service.ts` → Redis; fallback in-memory dev |
| T003 | [x] COMPLETED | `email.service.ts` → AbortSignal.timeout(10_000) |
| T004 | [x] COMPLETED | `circuit-breaker.ts` criado; aplicado em ResendProvider |
| T005 | [x] COMPLETED | `prisma.ts` → graceful shutdown; `.env.example` documentado |
| T006 | [x] COMPLETED | session/cron services → logger centralizado |
| T007 | [x] COMPLETED | `logger.ts` → JSON em produção, legível em dev |
| T008 | [x] COMPLETED | signals deprecated removidos de session.service.ts |
