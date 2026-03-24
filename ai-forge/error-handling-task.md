# Error Handling — Task List

> Auditoria: 2026-03-22 | Projeto: Corgly | Stack: Next.js App Router + next-intl

---

## Resumo dos Gaps

| Categoria | Problema | Severidade |
|---|---|---|
| global-error.tsx | Não existe — erros de layout raiz não são capturados | CRÍTICO |
| Logger centralizado | Não existe — `console.error` espalhado sem contexto | CRÍTICO |
| error.tsx sem logging | 9 de 10 error.tsx granulares não fazem log via useEffect | ALTO |
| error.tsx ausentes | 8 rotas com page.tsx e data fetching sem error.tsx | ALTO |
| loading.tsx ausentes | 8 rotas com page.tsx e data fetching sem loading.tsx | ALTO |
| Suspense fallback={null} | 3 ocorrências deixam UI em branco durante fetch | MÉDIO |
| catch vazio em API routes | 10+ routes com `} catch {` sem logar nem rethrow | MÉDIO |

---

### T001 – Criar global-error.tsx

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** [x]
**Arquivos:**
- criar: `src/app/global-error.tsx`

**Descrição:** O arquivo `src/app/error.tsx` captura erros do `page.tsx` abaixo do root layout, mas erros dentro do próprio `layout.tsx` sobem para `global-error.tsx`, que não existe. Este arquivo deve usar `<html><body>` próprios e não depender de libs externas (next-intl pode falhar junto).

**Critérios de Aceite:**
- `src/app/global-error.tsx` existe com `<html>` e `<body>` próprios
- Não importa next-intl, shadcn ou qualquer lib que possa falhar
- Loga via `console.error(error)` (integração Sentry via T002)
- Botão de reset funcional

**Estimativa:** 30min

---

### T002 – Criar logger centralizado

**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** [x]
**Arquivos:**
- criar: `src/lib/logger.ts`

**Descrição:** Não existe nenhum logger em `src/lib/`. Todos os 40+ pontos de `console.error` no codebase perdem contexto (rota, userId, digest, action). Um logger centralizado resolve isso e prepara integração com Sentry.

**Critérios de Aceite:**
- `src/lib/logger.ts` exporta `logger.error(message, context)` e `logger.warn`
- Em desenvolvimento: mantém `console.error` com prefixo estruturado
- Preparado para Sentry: `Sentry.captureException()` via env flag `NEXT_PUBLIC_SENTRY_DSN`
- Aceita contexto: `{ route, userId, digest, action }`

**Estimativa:** 45min

---

### T003 – Adicionar useEffect de logging em error.tsx granulares

**Tipo:** PARALLEL-GROUP-1
**Dependências:** T002
**Status:** [x]
**Arquivos (modificar):**
- `src/app/(admin)/admin/dashboard/error.tsx`
- `src/app/(admin)/admin/schedule/error.tsx`
- `src/app/(admin)/admin/sessions/error.tsx`
- `src/app/(admin)/admin/students/error.tsx`
- `src/app/(admin)/admin/students/[id]/error.tsx`
- `src/app/(student)/dashboard/error.tsx`
- `src/app/(student)/history/error.tsx`
- `src/app/(student)/progress/error.tsx`
- `src/app/(student)/schedule/error.tsx`
- `src/app/error.tsx` (substituir TODO por logger real)

**Descrição:** 9 de 10 error.tsx granulares não têm `useEffect` para logging. Erros silenciosos impossibilitam debugging em produção. O root `error.tsx` tem `useEffect` mas apenas `console.error` com TODO.

**Critérios de Aceite:**
- Todos os error.tsx importam `useEffect` e `logger`
- Log inclui `error.digest` e rota (via `usePathname`)
- `src/app/error.tsx` usa logger real em vez de `console.error`

**Estimativa:** 1h

---

### T004 – Criar error.tsx para rotas admin sem boundary

**Tipo:** PARALLEL-GROUP-2
**Dependências:** T002
**Status:** [x]
**Arquivos (criar):**
- `src/app/(admin)/admin/content/error.tsx`
- `src/app/(admin)/admin/credits/error.tsx`
- `src/app/(admin)/admin/feedback/[sessionId]/error.tsx`
- `src/app/(admin)/admin/reports/error.tsx`
- `src/app/(admin)/admin/sessions/[id]/error.tsx`

**Descrição:** Rotas admin com data fetching não têm `error.tsx`. Falhas propagam para o root error boundary sem contexto da rota.

**Critérios de Aceite:**
- Cada error.tsx segue padrão existente (card centralizado, reset, link para /admin)
- Inclui useEffect com logging (digest + rota)
- Mensagem específica por rota (ex: "Erro ao carregar feedback da sessão")

**Estimativa:** 45min

---

### T005 – Criar error.tsx para rotas student/public sem boundary

**Tipo:** PARALLEL-GROUP-2
**Dependências:** T002
**Status:** [x]
**Arquivos (criar):**
- `src/app/(student)/session/[id]/error.tsx`
- `src/app/(student)/credits/error.tsx`
- `src/app/(public)/content/[id]/error.tsx`

**Descrição:** Rotas de aluno e conteúdo público sem error boundary. A rota de sessão ao vivo é crítica — qualquer erro deve ter recovery claro.

**Critérios de Aceite:**
- error.tsx da sessão inclui link para /dashboard além do reset
- Inclui useEffect com logging
- error.tsx de conteúdo tem link para /content (lista)

**Estimativa:** 30min

---

### T006 – Criar loading.tsx para rotas admin sem estado de loading

**Tipo:** PARALLEL-GROUP-3
**Dependências:** none
**Status:** [x]
**Arquivos (criar):**
- `src/app/(admin)/admin/content/loading.tsx`
- `src/app/(admin)/admin/credits/loading.tsx`
- `src/app/(admin)/admin/feedback/[sessionId]/loading.tsx`
- `src/app/(admin)/admin/reports/loading.tsx`
- `src/app/(admin)/admin/sessions/[id]/loading.tsx`

**Descrição:** Rotas admin sem loading.tsx exibem tela em branco durante fetch server-side. Skeletons devem espelhar estrutura da página.

**Critérios de Aceite:**
- Cada loading.tsx usa skeleton que espelha layout da rota
- Skeletons usam `animate-pulse` com bg-muted
- Não hardcodea texto (spinner ou estrutura visual)

**Estimativa:** 45min

---

### T007 – Criar loading.tsx para rotas student/public sem estado de loading

**Tipo:** PARALLEL-GROUP-3
**Dependências:** none
**Status:** [x]
**Arquivos (criar):**
- `src/app/(student)/session/[id]/loading.tsx`
- `src/app/(student)/credits/loading.tsx`
- `src/app/(public)/content/[id]/loading.tsx`

**Descrição:** Mesma questão do T006 para rotas do aluno e conteúdo público.

**Critérios de Aceite:**
- loading.tsx da sessão exibe skeleton completo (player + sidebar)
- loading.tsx de créditos espelha cards de billing
- loading.tsx de conteúdo espelha layout do artigo

**Estimativa:** 30min

---

### T008 – Substituir Suspense fallback={null} por skeletons

**Tipo:** PARALLEL-GROUP-4
**Dependências:** none
**Status:** [x]
**Arquivos (modificar):**
- `src/app/(student)/dashboard/page.tsx` (2 ocorrências)
- `src/app/(admin)/admin/students/page.tsx` (1 ocorrência)

**Descrição:** 3 `<Suspense fallback={null}>` deixam áreas da UI em branco durante fetch, violando a regra "Zero Estados Indefinidos".

**Critérios de Aceite:**
- Todas as ocorrências `fallback={null}` substituídas por skeleton inline (div animate-pulse)
- Skeleton tem altura aproximada do conteúdo real

**Estimativa:** 20min

---

### T009 – Corrigir catch vazio em API routes críticas

**Tipo:** PARALLEL-GROUP-5
**Dependências:** T002
**Status:** [x]
**Arquivos (modificar):**
- `src/app/api/v1/content/[id]/notes/route.ts`
- `src/app/api/v1/content/route.ts`
- `src/app/api/v1/credits/route.ts`
- `src/app/api/v1/payments/route.ts`
- `src/app/api/v1/recurring-patterns/[id]/route.ts`
- `src/app/api/v1/recurring-patterns/route.ts`

**Descrição:** Catch vazio (`} catch {`) silencia erros sem log. Em produção, falhas de DB ou parsing passam despercebidas.

**Critérios de Aceite:**
- Cada catch captura `(err)` e chama `logger.error()`
- Retorna `NextResponse.json({ error: 'Erro interno' }, { status: 500 })`
- Health routes (design intencional de catch vazio) podem ser excluídas

**Estimativa:** 30min

---
