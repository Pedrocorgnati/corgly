# Accessibility Tasks — Corgly
Gerado em: 2026-03-22

---

### T001 - Corrigir saltos de heading h1→h3 (h2 ausente)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/app/(student)/dashboard/page.tsx`
- modificar: `src/app/(admin)/admin/schedule/schedule-client.tsx`
- modificar: `src/app/(admin)/admin/reports/page.tsx`

**Descrição:**
Três páginas têm `<h1>` seguido diretamente de `<h3>`, pulando `<h2>`. Isso quebra a hierarquia semântica e prejudica screen readers.

- `dashboard/page.tsx:202` — "Ações rápidas" → `<h3>` deve ser `<h2>`
- `schedule-client.tsx:57` — "Próximas aulas" → `<h3>` deve ser `<h2>`
- `reports/page.tsx:27` — cartões de relatório → `<h3>` deve ser `<h2>`

**WCAG:** 1.3.1, 2.4.6

**Critérios de Aceite:**
- [ ] Nenhuma página tem salto de nível de heading
- [ ] Hierarquia h1→h2 correta em todas as 3 páginas
- [ ] Verificado com extensão headings map (HeadingsMap / axe)

**Estimativa:** 0.5h

---

### T002 - Adicionar aria-label e aria-current nos breadcrumbs

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/app/(student)/session/[id]/feedback/page.tsx`
- modificar: `src/app/(admin)/admin/feedback/[sessionId]/page.tsx`
- modificar: `src/app/(admin)/admin/students/[id]/page.tsx`

**Descrição:**
Três `<nav>` usados como breadcrumb não têm `aria-label="Breadcrumb"` nem `aria-current="page"` no item ativo (último item). Screen readers não anunciam o propósito da navegação.

**WCAG:** 1.3.1, 2.4.8

**Critérios de Aceite:**
- [ ] `aria-label="Breadcrumb"` em todos os 3 navs
- [ ] `aria-current="page"` no último span/item de cada breadcrumb
- [ ] Testado com screen reader (VoiceOver/NVDA)

**Estimativa:** 0.5h

---

### T003 - Adicionar aria-label nas navs de sidebar e mobile drawers

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/components/shared/student-sidebar.tsx`
- modificar: `src/components/shared/admin-sidebar.tsx`
- modificar: `src/components/mobile/mobile-student-drawer.tsx`
- modificar: `src/components/mobile/mobile-admin-drawer.tsx`

**Descrição:**
Sidebars e drawers móveis têm `<nav>` sem `aria-label`. Múltiplos landmarks `<nav>` na mesma página precisam de labels distintos.

**WCAG:** 1.3.1

**Critérios de Aceite:**
- [ ] `aria-label="Navegação do estudante"` na sidebar e drawer do estudante
- [ ] `aria-label="Navegação do administrador"` na sidebar e drawer do admin
- [ ] Testado com screen reader

**Estimativa:** 0.25h

---

### T004 - Anunciar erros de validação do StarRating para screen readers

**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/components/feedback/StarRating.tsx`

**Descrição:**
O componente `StarRating` exibe erros via `<p className="text-xs text-destructive">` sem `role="alert"`. Screen readers não anunciam o erro automaticamente. Também falta `aria-describedby` ligando o radiogroup à mensagem de erro.

**WCAG:** 3.3.1, 4.1.3

**Critérios de Aceite:**
- [ ] `role="alert"` ou `aria-live="polite"` adicionado ao parágrafo de erro
- [ ] `aria-describedby` no radiogroup aponta para o erro quando ele existe
- [ ] Erro anunciado automaticamente por screen reader ao aparecer

**Estimativa:** 0.5h

---

### T005 - Implementar roving tabindex nos dots do onboarding

**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/components/onboarding/onboarding-slides.tsx`

**Descrição:**
Os dots de progresso têm `role="tab"` mas todos ficam na ordem de Tab (sem roving tabindex). O padrão ARIA para `role="tablist"` exige que apenas o tab ativo tenha `tabIndex={0}` e os demais `tabIndex={-1}`, navegados com ArrowLeft/Right.

**WCAG:** 4.1.2

**Critérios de Aceite:**
- [ ] Apenas o dot ativo tem `tabIndex={0}`, os demais `tabIndex={-1}`
- [ ] ArrowLeft/Right movem foco entre dots e trocam o slide ativo
- [ ] Testado com navegação só por teclado

**Estimativa:** 0.5h

---

### T006 - Adicionar focus-visible no TabsPanel

**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/components/ui/tabs.tsx`

**Descrição:**
O `TabsPanel` tem `outline-none` sem alternativa `focus-visible:ring-*`. Ao focar o painel via teclado (Tab após sair de um tab ativo), o foco fica invisível.

**WCAG:** 2.4.7

**Critérios de Aceite:**
- [ ] Foco visível no TabsPanel ao navegar por teclado
- [ ] Verificado com navegação Tab em componente que use Tabs

**Estimativa:** 0.25h

---

### T007 - Corrigir contraste de --muted-foreground no modo light

**Tipo:** SEQUENTIAL
**Dependências:** T001, T002, T003
**Arquivos:**
- modificar: `src/app/globals.css`

**Descrição:**
`--muted-foreground` em modo light é `#9CA3AF` com contraste ≈ 2.37:1 contra branco — falha WCAG 1.4.3 (mínimo 4.5:1 para texto normal). Afeta subtítulos, textos de ajuda, hints e rótulos secundários em toda a aplicação.

Valor recomendado: `#5B6370` (contraste ≈ 5.36:1 ✅) — requer revisão de design.

**WCAG:** 1.4.3

**Critérios de Aceite:**
- [ ] `--muted-foreground` light mode com contraste ≥ 4.5:1 contra o background
- [ ] Visual revisado e aprovado (impacto estético significativo)
- [ ] Verificado com ferramenta de contraste (axe, Lighthouse)

**Estimativa:** 1h (inclui revisão de design)
