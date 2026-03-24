# Data Fetching — Task List

> Gerado por `/nextjs:data-fetching` em 2026-03-23
> Repo: `output/workspace/corgly`

---

### T001 — generateStaticParams em /content/[id]

**Status:** [x] COMPLETED
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificado: `src/app/(public)/content/[id]/page.tsx`

**Descrição:**
A rota `/content/[id]` usa `CONTENT_MAP` 100% hardcoded (6 slugs fixos). Adicionado `generateStaticParams` para pré-gerar as 6 páginas no build + `export const revalidate = false` + `dynamicParams = false`.

**Critérios de Aceite:**
- [x] `generateStaticParams` exportado retornando todos os slugs do `CONTENT_MAP`
- [x] `export const revalidate = false` adicionado
- [x] `dynamicParams = false` adicionado (404 para slugs não existentes)

---

### T002 — cache: 'no-store' explícito nas apiFetch de dados de usuário

**Status:** [x] COMPLETED
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificado: `src/actions/dashboard.ts`
- modificado: `src/actions/sessions.ts`
- modificado: `src/actions/admin-students.ts`
- modificado: `src/actions/admin-dashboard.ts`
- modificado: `src/actions/progress.ts`

**Critérios de Aceite:**
- [x] `cache: 'no-store'` adicionado no `fetch()` de todos os `apiFetch` internos

---

### T003 — cache: 'no-store' nos layouts + dynamic config

**Status:** [x] COMPLETED
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificado: `src/app/(admin)/layout.tsx`
- modificado: `src/app/(student)/layout.tsx`

**Critérios de Aceite:**
- [x] `export const dynamic = 'force-dynamic'` adicionado em ambos os layouts
- [x] `cache: 'no-store'` adicionado no fetch (via getAuthUser em T005)

---

### T004 — export const dynamic nas páginas dinâmicas sem config

**Status:** [x] COMPLETED
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificado: `src/app/(student)/dashboard/page.tsx`
- modificado: `src/app/(admin)/admin/sessions/[id]/page.tsx`
- modificado: `src/app/(admin)/admin/students/[id]/page.tsx`
- modificado: `src/app/(admin)/admin/feedback/[sessionId]/page.tsx`

**Critérios de Aceite:**
- [x] `export const dynamic = 'force-dynamic'` adicionado em todas as páginas listadas

---

### T005 — Eliminar duplicação de /api/v1/auth/me com React.cache()

**Status:** [x] COMPLETED
**Tipo:** SEQUENTIAL
**Dependências:** T002, T003
**Arquivos:**
- criado: `src/lib/data/auth.ts`
- modificado: `src/app/(admin)/layout.tsx`
- modificado: `src/app/(student)/layout.tsx`
- modificado: `src/actions/dashboard.ts`

**Critérios de Aceite:**
- [x] `src/lib/data/auth.ts` criado com `getAuthUser` wrappado em `React.cache()`
- [x] Layout admin e student usam `getAuthUser()` ao invés de fetch direto
- [x] `getDashboardUser()` delega para `getAuthUser()` — deduplicated
- [x] Apenas 1 request HTTP para `/api/v1/auth/me` por render request
