# Scalability Report — Corgly

> Gerado por `/nextjs:scalability` em 2026-03-23
> Config: `.claude/projects/corgly.json`

---

## Contexto do Projeto

Corgly é uma plataforma B2C de agendamento de sessões de tutoria — **single-tenant, single-professor**. Não há isolamento multi-tenant (não aplicável). O stack é Next.js + MySQL (Prisma) + Vercel (serverless) + Hocuspocus (WebSocket, processo separado).

---

## Resumo Executivo

| Categoria | Status | Issues |
|-----------|--------|--------|
| Multi-tenancy | N/A | Single-tenant |
| Resiliência | ⚠️ PARCIAL | Sem timeout por request no email; sem circuit breaker |
| Horizontal Scaling | 🔴 BLOQUEADO | Rate limiter e signaling in-memory quebram com > 1 instância |
| Database | ⚠️ PARCIAL | Sem connection_limit; offset pagination |
| Background Jobs | ✅ OK | Vercel cron configurado; padrões sequenciais seguros |
| API Design | ⚠️ PARCIAL | Offset pagination em vez de cursor |
| Observability | ⚠️ PARCIAL | Health checks OK; logs não-estruturados; sem tracing |
| Cache | N/A | Nenhuma camada de cache (adequado para escala atual) |

**Veredito:** `APROVADO COM RESSALVAS` — App funciona corretamente para instância única. Para Vercel com auto-scaling ativo, as issues CRÍTICAS (T001, T002) devem ser resolvidas antes de tráfego concorrente alto.

---

## PHASE 1 — Achados Detalhados

### 🔴 CRÍTICO — Rate Limiter In-Memory

**Arquivo:** `src/lib/rate-limit.ts:19`
**Evidência:** `rg "new Map" src/lib/rate-limit.ts`

```
const store = new Map<string, RateLimitEntry>();
```

O próprio código documenta: *"For production, replace with Redis-backed solution"*. Em múltiplas instâncias Vercel, cada instância mantém seu próprio `Map` — um usuário que esgotou o limite em instância A não será bloqueado em instância B. Rate limiting é ineficaz.

**Impacto:** Segurança e proteção de abuso comprometidas com auto-scaling.

---

### 🔴 CRÍTICO — Signaling Service In-Memory

**Arquivo:** `src/services/signaling.service.ts:1-60`
**Evidência:** `rg "private store = new Map" src/services/signaling.service.ts`

```typescript
private store = new Map<string, StoredSignal[]>()
```

Documentado: *"Thread-safe para single-server MVP"*. O WebRTC signaling (offer/answer/ICE candidates) é armazenado na memória da instância que recebe o POST. Se o GET for roteado para outra instância (Vercel distribui requests), os signals não são encontrados → WebRTC never establishes.

**Impacto:** Funcionalidade core (sala virtual) quebra com > 1 instância.

---

### 🟡 ALTO — Email Fetch sem Timeout por Request

**Arquivo:** `src/services/email.service.ts:400`
**Evidência:** `rg "await fetch.*resend" src/services/email.service.ts`

```typescript
const response = await fetch('https://api.resend.com/emails', { ... });
```

O serviço tem retry com backoff exponencial (3 tentativas × delays de 500ms/1s/2s) ✅, mas cada `fetch` individual não tem `AbortSignal.timeout`. Uma conexão travada (TCP stall, sem resposta) bloquearia o worker serverless por minutos até o OS timeout.

---

### 🟡 ALTO — Sem Circuit Breaker em Chamadas Externas

**Arquivo:** `src/services/email.service.ts`, `src/services/stripe.service.ts`
**Evidência:** `rg "circuit|breaker|CircuitBreaker" src/ -g "*.ts"` → 0 results

Nenhum circuit breaker implementado. Se o Resend cair, cada email fire-and-forget tenta 3× por 3.5s cada → para N sessões canceladas em bulk, N×3.5s de worker time desperdiçado. Stripe service também não tem proteção.

---

### 🟡 ALTO — Prisma sem connection_limit para Serverless

**Arquivo:** `src/lib/prisma.ts`, `.env.example`
**Evidência:** `rg "connection_limit" .env.example` → sem resultado

```typescript
// .env.example
DATABASE_URL=  // sem ?connection_limit=5
```

Prisma em serverless cria até `connection_limit` conexões por instância (default: 5 para MySQL). Sem configuração explícita, o Prisma pode usar o default mais alto. Com muitas instâncias concorrentes, o MySQL pode atingir `max_connections`.

---

### 🟡 ALTO — Graceful Shutdown do Prisma Ausente

**Arquivo:** `src/lib/prisma.ts`
**Evidência:** Leitura direta do arquivo

Nenhum `process.on('beforeExit', () => prisma.$disconnect())`. Em ambientes serverless isso é menos crítico (processo morre com o request), mas no docker-compose/PM2 (que o projeto usa) pode causar connection leaks.

---

### 🟠 MÉDIO — Logging Não-Estruturado em Services

**Arquivos:** `src/services/session.service.ts`, `src/services/cron.service.ts`, `src/services/auth.service.ts`, `src/services/stripe.service.ts`, `src/services/email.service.ts`
**Evidência:** `rg "console\.(log|error|warn|info)" src/ -g "*.ts" | grep -v "test"` → 30 resultados em services

Existe `src/lib/logger.ts` centralizado mas os services fazem `console.error(...)` diretamente. Em produção, `logger.ts` faz `console.error(formatted, {...})` — strings não são parseáveis automaticamente por ferramentas de agregação de logs.

---

### 🟠 MÉDIO — Logger não emite JSON em Produção

**Arquivo:** `src/lib/logger.ts`
**Evidência:** Leitura direta

O logger formata mensagens como string mesmo em produção (`console.error(formatted, context)`). Para indexação automática em Datadog/Logtail, o output deve ser `JSON.stringify({level, message, timestamp, ...context})`.

---

### 🟢 BAIXO — Código Deprecated Vivo (in-memory signals legados)

**Arquivo:** `src/services/session.service.ts:752-773`
**Evidência:** `rg "@deprecated" src/services/session.service.ts`

```typescript
/** @deprecated Use signalingService from signaling.service.ts */
private signals = new Map<string, unknown[]>();
```

Dead code não remove risco (já substituído pelo `signalingService`), mas representa debt técnico e confusão para leitores futuros.

---

### 🟢 BAIXO — Offset Pagination em todas as Listagens

**Arquivos:** `src/services/session.service.ts:522`, `src/app/api/v1/payments/route.ts:22`, `src/services/feedback.service.ts`
**Evidência:** `rg "skip.*page.*limit" src/ -g "*.ts"` → múltiplos resultados

```typescript
const skip = (page - 1) * limit;
```

Offset pagination degrada com datasets grandes (ORDER BY + SKIP de 10K+ rows = full sort). Para escala atual (tutoria 1-professor), é adequado. Para escala futura, migrar para cursor pagination.

---

## Pontos Positivos (Sem Ação)

| Item | Evidência |
|------|-----------|
| Health checks bem implementados | `/api/health` e `/api/health/detail` com timeout, auth, múltiplos checks |
| Vercel Cron configurado | 4 jobs em `vercel.json` |
| Transações atômicas com pessimistic lock | `session.service.ts` usa `FOR UPDATE` + CAS |
| FEFO credit consume | `credit.service.ts` usa `SELECT FOR UPDATE` |
| Retry em email com backoff | 3 tentativas × delays exponenciais |
| Fire-and-forget corretamente implementado | `void emailService.send(...).catch(...)` |
| Idempotência nos crons | `reminderSentAt`, verificação de duplicados |
| Sem `$executeRawUnsafe` | Todos os raw são template literals parametrizados |
| Bulk cancel sequencial (safe) | `for...of` com `await` — não satura pool |
| RLS via userId nos queries | Todas as queries de sessão filtram por `studentId` |

---

## PHASE 2 — Task List

Ver: `ai-forge/nextjs-scalability-tasks.md`

| Task | Prioridade | Estimativa |
|------|-----------|-----------|
| T001 — Rate limiter → Redis (Upstash) | CRÍTICA | 2h |
| T002 — Signaling → Redis | CRÍTICA | 3h |
| T003 — Email fetch timeout | ALTA | 0.5h |
| T004 — Circuit breaker (Email) | ALTA | 1.5h |
| T005 — Prisma connection_limit | ALTA | 0.5h |
| T006 — Logs → logger centralizado | MÉDIA | 1.5h |
| T007 — Logger JSON em produção | MÉDIA | 0.5h |
| T008 — Remove deprecated signals | BAIXA | 0.25h |

**Total estimado:** ~10h

---

## PHASE 3 — Execução

> Status atualizado conforme tasks são executadas.

| Task | Status | Resultado |
|------|--------|-----------|
| T001 | ✅ COMPLETED | `rate-limit.ts` reescrito; `@upstash/ratelimit` instalado; middleware async |
| T002 | ✅ COMPLETED | `signaling.service.ts` reescrito com Redis + fallback in-memory |
| T003 | ✅ COMPLETED | `AbortSignal.timeout(10_000)` no fetch do ResendProvider |
| T004 | ✅ COMPLETED | `src/lib/circuit-breaker.ts` criado; aplicado no ResendProvider |
| T005 | ✅ COMPLETED | Graceful shutdown em `prisma.ts`; `.env.example` documentado |
| T006 | ✅ COMPLETED | `console.*` em session/cron services → `logger.*` |
| T007 | ✅ COMPLETED | Logger emite JSON em produção |
| T008 | ✅ COMPLETED | `private signals = new Map()` e métodos deprecated removidos |
