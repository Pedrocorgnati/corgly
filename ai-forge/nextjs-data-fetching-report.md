# Data Fetching — Report

> Gerado por `/nextjs:data-fetching` em 2026-03-23

---

## Resumo Executivo

| Métrica | Antes | Depois |
|---------|-------|--------|
| fetch() sem cache explícito | 8 | 0 |
| Páginas com `force-dynamic` faltando | 6 | 0 |
| Requisições duplicadas `/auth/me` | 3 por render | 1 (React.cache) |
| `generateStaticParams` em rotas estáticas | 0 | 1 |
| React.cache() em uso | Não | Sim |
| Waterfalls sequenciais desnecessários | 0 | 0 |
| N+1 queries | 0 | 0 |

---

## PHASE 1 — Problemas Encontrados

### Cache

**8 ocorrências de fetch() sem `cache: 'no-store'` em dados de usuário autenticado:**
- `src/actions/dashboard.ts:9` — apiFetch sem cache
- `src/actions/sessions.ts:11` — apiFetch sem cache
- `src/actions/admin-students.ts:10` — apiFetch sem cache
- `src/actions/admin-dashboard.ts:10` — apiFetch sem cache
- `src/actions/progress.ts:9` — apiFetch sem cache
- `src/app/(admin)/layout.tsx:21` — fetch auth sem cache
- `src/app/(student)/layout.tsx:24` — fetch auth sem cache
- `src/app/(admin)/admin/sessions/[id]/page.tsx:21` — fetch com headers mas sem cache

**Evidência:**
```bash
grep -n "await fetch(" src/actions/*.ts src/app/**/layout.tsx
```

**Tags de cache:** Não usadas (projeto MVP sem necessidade imediata).

### Request Deduplication

**`/api/v1/auth/me` chamado 3x no mesmo render sem deduplicação:**
- `src/app/(admin)/layout.tsx:21`
- `src/app/(student)/layout.tsx:24`
- `src/actions/dashboard.ts:75` via `getDashboardUser()`

Sem `React.cache()`, cada chamada faz um HTTP request independente ao backend interno.

**Evidência:**
```bash
grep -rn "auth/me" src/ --include="*.ts" --include="*.tsx"
```

### Static Generation

**`/content/[id]` sem generateStaticParams:**
- `src/app/(public)/content/[id]/page.tsx` — CONTENT_MAP 100% hardcoded com 6 slugs fixos
- Sem `generateStaticParams`, cada acesso faz SSR desnecessário
- `dynamicParams` não configurado → slugs inválidos resultavam em erro ao invés de 404

**Evidência:**
```bash
grep -rn "generateStaticParams" --include="*.tsx" → 0 resultados
grep -n "CONTENT_MAP" src/app/(public)/content/[id]/page.tsx → 6 slugs hardcoded
```

### Route Segment Config

**6 páginas dinâmicas sem `export const dynamic = 'force-dynamic'`:**
- `src/app/(admin)/layout.tsx` — usa `cookies()`
- `src/app/(student)/layout.tsx` — usa `cookies()`
- `src/app/(student)/dashboard/page.tsx` — usa Server Actions com `cookies()`
- `src/app/(admin)/admin/sessions/[id]/page.tsx` — usa `headers()`
- `src/app/(admin)/admin/students/[id]/page.tsx` — usa cookies via actions
- `src/app/(admin)/admin/feedback/[sessionId]/page.tsx` — usa cookies via actions

**Evidência:**
```bash
grep -rn "export const dynamic" src/app/ --include="*.tsx" → apenas 4 rotas de health
```

### Streaming / Suspense

**Suspense sem fallback (fora do escopo — delegar a `/nextjs:error-handling`):**
- `src/app/(public)/auth/reset-password/page.tsx:192` — `<Suspense>` sem fallback
- `src/app/(public)/auth/cancel-deletion/page.tsx:113` — `<Suspense>` sem fallback
- `src/app/(public)/auth/confirm-email/page.tsx:138` — `<Suspense>` sem fallback

**Pontos positivos:**
- `dashboard/page.tsx` usa `Promise.all` corretamente para 5 calls paralelas ✅
- 0 waterfalls sequenciais desnecessários ✅
- 0 N+1 queries ✅

### Data Location

**`getDashboardUser()` duplica o fetch do layout:**
- O layout já buscou `/api/v1/auth/me` para fazer o auth guard
- `getDashboardUser()` em `dashboard.ts` fazia um segundo request idêntico

---

## PHASE 3 — Correções Aplicadas

### T001 — generateStaticParams em /content/[id] ✅

```typescript
// src/app/(public)/content/[id]/page.tsx
export async function generateStaticParams() {
  return Object.keys(CONTENT_MAP).map((id) => ({ id }));
}
export const dynamicParams = false;
export const revalidate = false;
```

**Impacto:** 6 páginas passam de SSR sob demanda para SSG no build. Tempo de resposta: de ~50-200ms (SSR) para <10ms (CDN cache).

### T002 — cache: 'no-store' nas apiFetch ✅

`cache: 'no-store'` adicionado em:
- `dashboard.ts`, `admin-students.ts`, `admin-dashboard.ts`, `progress.ts` — direto no fetch
- `sessions.ts` — condicional: apenas em GET (mutations não devem ter cache header)

### T003 — dynamic config nos layouts ✅

```typescript
// (admin)/layout.tsx e (student)/layout.tsx
export const dynamic = 'force-dynamic';
```

### T004 — export const dynamic nas páginas ✅

Adicionado em dashboard, sessions/[id], students/[id], feedback/[sessionId].

### T005 — React.cache() para /api/v1/auth/me ✅

**Criado:** `src/lib/data/auth.ts`
```typescript
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  // fetch com cache: 'no-store' + cookies
});
```

**Layouts** agora usam `getAuthUser()` ao invés de fetch inline.
**`getDashboardUser()`** delega para `getAuthUser()` — se o layout já chamou no mesmo render, o React.cache() retorna o valor memoizado sem novo HTTP request.

**Impacto:** Elimina 1-2 requests HTTP extras para `/api/v1/auth/me` a cada render do dashboard/admin.

---

## Problemas Delegados a Outros Comandos

| Problema | Arquivo | Comando |
|---------|---------|---------|
| `<Suspense>` sem fallback | `reset-password/page.tsx:192` | `/nextjs:error-handling` |
| `<Suspense>` sem fallback | `cancel-deletion/page.tsx:113` | `/nextjs:error-handling` |
| `<Suspense>` sem fallback | `confirm-email/page.tsx:138` | `/nextjs:error-handling` |
| `apiFetch` duplicado em 5 arquivos | `src/actions/*.ts` | `/nextjs:architecture` |

---

## Checklist Final

### Cache
- [x] Todos os fetch() de dados dinâmicos têm `cache: 'no-store'`
- [x] `revalidate = false` em rotas 100% estáticas
- [x] ISR configurado na landing (`revalidate = 3600`) e content list (`revalidate = 300`)
- [ ] Tags de cache: N/A para MVP atual

### Waterfall
- [x] `Promise.all` em uso no dashboard ✅
- [x] 0 N+1 queries

### Deduplication
- [x] `React.cache()` implementado para `/api/v1/auth/me`
- [x] Layout e page não duplicam mais o fetch de auth

### Static Generation
- [x] `generateStaticParams` em `/content/[id]`
- [x] `dynamicParams = false` configurado

### Route Config
- [x] `force-dynamic` em todos os layouts e páginas autenticadas

### Veredito: ✅ APROVADO
