# Next.js Components — Task List
**Projeto:** Corgly | **Data:** 2026-03-23 | **Status:** IN_PROGRESS

---

## Resumo da Auditoria

O projeto Corgly demonstra excelente uso dos componentes Next.js. Apenas 2 issues críticos e 1 aceitável foram encontrados.

---

## Tasks

### T001 – Image `fill` sem `sizes` no hero-section
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/landing/hero-section.tsx`

**Descrição:** A `<Image fill>` na seção hero não declara `sizes`, o que faz o browser baixar a imagem em tamanho máximo desnecessariamente, prejudicando o LCP. O container tem dimensões fixas (`w-[300px] md:w-[360px]`), então `sizes` deve refletir esses valores.

**Critérios de Aceite:**
- `sizes="(max-width: 768px) 300px, 360px"` adicionado à Image do hero
- Sem warnings de `next/image` no build

**Estimativa:** 0.1h
**Status:** COMPLETED

---

### T002 – Raw `<a>` no BookingConfirmModal (deve usar `<Link>`)
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/components/calendar/BookingConfirmModal.tsx`

**Descrição:** `<Button asChild><a href={ROUTES.CREDITS}>` usa tag `<a>` em vez de `<Link>`, perdendo prefetch e causando reload desnecessário. Além disso, `ROUTES` e `Link` não estão importados no arquivo.

**Critérios de Aceite:**
- `import Link from 'next/link'` adicionado
- `import { ROUTES } from '@/lib/constants/routes'` adicionado
- `<a href={ROUTES.CREDITS}>` substituído por `<Link href={ROUTES.CREDITS}>`

**Estimativa:** 0.1h
**Status:** COMPLETED

---

### T003 – `window.location.href` em useAuth (aceitável — documentado)
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- `src/hooks/useAuth.tsx` (linhas 64, 81)

**Descrição:** O hook usa `window.location.href` para redirecionar após expiração de sessão e logout. Isso é **intencional**: força um reload completo para limpar estado React, tokens em memória e contexto de autenticação. `router.push()` não resolveria esse cenário adequadamente.

**Critérios de Aceite:**
- Documentado como comportamento intencional
- Nenhuma mudança necessária

**Estimativa:** 0h
**Status:** COMPLETED (aceitável — sem mudança)
