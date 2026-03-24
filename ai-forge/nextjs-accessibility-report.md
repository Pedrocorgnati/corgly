# Accessibility Report — Corgly
Gerado em: 2026-03-22

## Resumo Executivo

| Categoria | Issues | Status |
|-----------|--------|--------|
| Headings hierarquia | 3 páginas (h1→h3) | ✅ Corrigido |
| Breadcrumb aria-label | 3 navs sem label | ✅ Corrigido |
| Sidebar/Drawer nav aria-label | 4 navs sem label | ✅ Corrigido |
| StarRating error anúncio | 1 componente | ✅ Corrigido |
| Onboarding roving tabindex | 1 componente | ✅ Corrigido |
| TabsPanel focus-visible | 1 componente | ✅ Corrigido |
| muted-foreground contraste | 1 variável CSS global | ✅ Corrigido |

---

## Problemas Corrigidos

### T001 — Headings h1→h3 (WCAG 1.3.1, 2.4.6)

**Arquivos modificados:**
- `src/app/(student)/dashboard/page.tsx:202` — `<h3>` → `<h2>` "Ações rápidas"
- `src/app/(admin)/admin/schedule/schedule-client.tsx:57` — `<h3>` → `<h2>` "Próximas aulas"
- `src/app/(admin)/admin/reports/page.tsx:27` — `<h3>` → `<h2>` nos cartões de relatório

**Impacto:** Screen readers anunciam estrutura de headings corretamente; navegação por headings (h, H no NVDA) funciona sem pulos de nível.

---

### T002 — Breadcrumbs: aria-label + aria-current (WCAG 1.3.1, 2.4.8)

**Arquivos modificados:**
- `src/app/(student)/session/[id]/feedback/page.tsx:24`
- `src/app/(admin)/admin/feedback/[sessionId]/page.tsx:84`
- `src/app/(admin)/admin/students/[id]/page.tsx:108`

**O que foi feito:**
- `aria-label="Breadcrumb"` em cada `<nav>`
- `aria-current="page"` no item ativo (último span)
- `aria-hidden="true"` nos separadores ChevronRight

**Impacto:** Screen readers anunciam "Breadcrumb, lista de navegação" e identificam a página atual.

---

### T003 — Sidebars/Drawers: nav aria-label (WCAG 1.3.1)

**Arquivos modificados:**
- `src/components/shared/student-sidebar.tsx` → `aria-label="Navegação do estudante"`
- `src/components/shared/admin-sidebar.tsx` → `aria-label="Navegação do administrador"`
- `src/components/mobile/mobile-student-drawer.tsx` → `aria-label="Navegação do estudante"`
- `src/components/mobile/mobile-admin-drawer.tsx` → `aria-label="Navegação do administrador"`

**Impacto:** Múltiplos `<nav>` na mesma página são distinguíveis por screen readers.

---

### T004 — StarRating: erros anunciados (WCAG 3.3.1, 4.1.3)

**Arquivo modificado:** `src/components/feedback/StarRating.tsx`

**O que foi feito:**
- Adicionado `id={groupId + '-error'}` e `role="alert"` no parágrafo de erro
- Adicionado `aria-describedby` no radiogroup apontando para o erro quando ele existe

**Impacto:** Screen readers anunciam erros de validação imediatamente ao aparecerem.

---

### T005 — Onboarding dots: roving tabindex (WCAG 4.1.2)

**Arquivo modificado:** `src/components/onboarding/onboarding-slides.tsx`

**O que foi feito:**
- `tabIndex={i === currentSlide ? 0 : -1}` em cada botão dot
- Apenas o slide ativo é Tab-focável; os demais são alcançados via ArrowLeft/Right (já implementado no `handleKeyDown` global)

**Impacto:** Padrão ARIA de tablist correto — roving tabindex conforme especificação ARIA 1.1.

---

### T006 — TabsPanel: focus-visible (WCAG 2.4.7)

**Arquivo modificado:** `src/components/ui/tabs.tsx`

**O que foi feito:**
- Adicionado `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm` ao TabsPanel

**Impacto:** Foco visível no painel ativo ao navegar por teclado.

---

### T007 — muted-foreground: contraste corrigido (WCAG 1.4.3)

**Arquivo modificado:** `src/app/globals.css`

**O que foi feito:**
- `--muted-foreground` light mode: `#9CA3AF` (2.37:1 ❌) → `#5B6370` (5.36:1 ✅)

**Impacto:** Textos secundários, subtítulos e hints em todo o app agora têm contraste mínimo WCAG AA (4.5:1).

> ⚠️ **Atenção:** esta mudança afeta visualmente todos os textos com `text-muted-foreground`. Recomenda-se revisão de design após o merge.

---

## Conformidade WCAG 2.1 Level AA — Pós-Correção

### Level A
| Critério | Status |
|----------|--------|
| 1.1.1 Non-text Content | ✅ |
| 1.3.1 Info and Relationships | ✅ |
| 2.1.1 Keyboard | ✅ |
| 2.4.1 Bypass Blocks | ✅ |
| 4.1.2 Name, Role, Value | ✅ |

### Level AA
| Critério | Status |
|----------|--------|
| 1.4.3 Contrast (Minimum) | ✅ |
| 1.4.4 Resize Text | ✅ |
| 2.4.7 Focus Visible | ✅ |
| 2.4.6 Headings Descriptive | ✅ |
| 3.3.1 Error Identification | ✅ |

---

## Pontos Positivos (não alterados)

- `lang="pt-BR"` no `<html>` ✅
- Skip link funcional com CSS `.skip-nav:focus` ✅
- `id="main-content"` em todos os layouts (public, student, admin) ✅
- Modals com focus trap via Radix UI ✅
- `role="grid"`, `aria-label`, `aria-selected` no CalendarView ✅
- StarRating com `role="radiogroup"`, `role="radio"`, keyboard navigation ✅
- `role="alert"` em erros de formulário ✅
- `prefers-reduced-motion` via CSS global ✅
- Todos os `<Image>` com `alt` descritivo ✅
- `<iframe>` do VideoPlayer com `title` ✅
- Touch targets ≥ 44px no StarRating ✅
