# Styling Tasks — Corgly
Generated: 2026-03-22

---

### T001 – Registrar tokens semânticos no @theme inline
**Status:** COMPLETED
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/app/globals.css`

**Descrição:** `--success`, `--warning`, `--info` e seus `*-foreground` estão definidos em `:root` mas ausentes do bloco `@theme inline`. Sem esse registro, Tailwind v4 não gera as classes utilitárias (`text-success`, `bg-warning`, `text-info` etc.), forçando todos os componentes a usar hex hardcoded.

**Critérios de Aceite:**
- [ ] `--color-success`, `--color-success-foreground` adicionados ao `@theme inline`
- [ ] `--color-warning`, `--color-warning-foreground` adicionados
- [ ] `--color-info`, `--color-info-foreground` adicionados
- [ ] `text-success`, `bg-success`, `text-warning`, `bg-warning`, `text-info`, `bg-info` funcionam como classes Tailwind

**Estimativa:** 0.5h

---

### T002 – Substituir hex hardcoded por tokens semânticos
**Status:** COMPLETED
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/components/dashboard/RecentFeedbackList.tsx`
- modificar: `src/app/(admin)/admin/students/page.tsx`
- modificar: `src/components/ui/credit-badge.tsx`
- modificar: `src/app/(public)/auth/cancel-deletion/page.tsx`
- modificar: `src/app/(public)/auth/resend-confirmation/page.tsx`
- modificar: `src/components/session/feedback-form.tsx`
- modificar: `src/components/session/AudioOnlyOverlay.tsx`
- modificar: `src/app/(student)/progress/page.tsx`
- modificar: `src/components/session/SessionControls.tsx`
- modificar: `src/app/(admin)/admin/feedback/[sessionId]/page.tsx`
- modificar: `src/app/(public)/auth/confirm-email/page.tsx`
- modificar: `src/app/(public)/auth/reset-password/page.tsx`
- modificar: `src/components/landing/professor-section.tsx`
- modificar: `src/components/feedback/StarRating.tsx`
- modificar: `src/components/landing/pricing-section.tsx`
- modificar: `src/components/student/pricing-cards.tsx`
- modificar: `src/components/student/credit-widget.tsx`
- modificar: `src/components/student/quick-stats.tsx`
- modificar: `src/components/auth/password-strength-meter.tsx`
- modificar: `src/components/admin/FeedbackReviewButton.tsx`
- modificar: `src/components/admin/PendingFeedbackWidget.tsx`
- modificar: `src/components/admin/StudentGrowthWidget.tsx`
- modificar: `src/components/admin/TodayWidget.tsx`
- modificar: `src/components/student/next-session-card.tsx`

**Descrição:** ~50 ocorrências de cores hardcoded devem usar os tokens semânticos registrados em T001.
Mapeamento:
- `text-[#059669]` / `bg-[#059669]` → `text-success` / `bg-success`
- `text-[#D97706]` / `bg-[#D97706]` → `text-warning` / `bg-warning`
- `text-[#DC2626]` / `bg-[#DC2626]` → `text-destructive` / `bg-destructive`
- `text-[#FB7185]` → `text-destructive` (dark token)
- `text-[#4F46E5]` → `text-primary`
- `text-[#6366F1]` → `text-secondary`
- `text-[#F59E0B]` / `fill-[#F59E0B]` → `text-warning` / `fill-warning` (ou `text-[#F59E0B]` se não houver fill-warning)
- `bg-[#1F2937]` → `bg-card`
- `text-[#D1D5DB]` → `text-muted-foreground`
- `bg-[#FEE2E2]` / `bg-[#FEF3C7]` / `bg-[#EEF2FF]` → `bg-destructive/10` / `bg-warning/10` / `bg-primary/10`

**Critérios de Aceite:**
- [ ] Zero ocorrências de `text-[#059669]`, `text-[#D97706]`, `text-[#DC2626]`, `text-[#4F46E5]`, `text-[#6366F1]` no src/
- [ ] Dark mode continua funcional (tokens de dark mode respeitados)
- [ ] Build sem erros

**Estimativa:** 2h

---

### T003 – Extrair gradiente da landing como utility class
**Status:** COMPLETED
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/app/globals.css`
- modificar: `src/components/landing/hero-section.tsx`
- modificar: `src/components/landing/cta-section.tsx`

**Descrição:** O gradiente `bg-gradient-to-br from-[#312E81] via-[#4F46E5] to-[#6366F1]` está duplicado em hero-section e cta-section. Extrair como `.bg-brand-gradient` em `@layer utilities`.

**Critérios de Aceite:**
- [ ] `.bg-brand-gradient` definido em `@layer utilities` em globals.css
- [ ] `hero-section.tsx` usa `bg-brand-gradient` em vez de hex
- [ ] `cta-section.tsx` usa `bg-brand-gradient`

**Estimativa:** 0.5h

---

### T004 – Substituir textarea/input nativos pelos UI components
**Status:** COMPLETED
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/components/admin/credit-adjust-form.tsx`
- modificar: `src/components/admin/BulkBlockModal.tsx`
- modificar: `src/components/calendar/CancelConfirmDialog.tsx`
- modificar: `src/components/session/feedback-form.tsx`
- modificar: `src/components/content/notes-editor.tsx`

**Descrição:** Múltiplos arquivos usam `<textarea>` e `<select>` nativos com className de 120+ chars duplicadas. Substituir por `<Textarea>` e `<Input>` do `@/components/ui`.

**Critérios de Aceite:**
- [ ] Nenhum `<textarea className="w-full rounded-lg border border-border...">` inline restante
- [ ] `<Textarea>` importado e usado corretamente com props adequadas
- [ ] Comportamento visual mantido (min-h, resize, etc. via className prop)

**Estimativa:** 1h

---

### T005 – Substituir botões inline pelo componente Button
**Status:** COMPLETED
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/components/progress/FeedbackHistory.tsx`
- modificar: `src/components/landing/testimonials-section.tsx`
- modificar: `src/components/content/notes-editor.tsx`

**Descrição:** Elementos `inline-flex items-center gap-1...` usados como botões em vez do componente `<Button>`. Substituir por `<Button variant="outline" size="sm">` ou `variant="ghost"` conforme contexto.

**Critérios de Aceite:**
- [ ] `FeedbackHistory.tsx` usa `<Button>` para paginação e ações
- [ ] `testimonials-section.tsx` usa `<Button>` para setas de navegação
- [ ] `notes-editor.tsx` usa `<Button>` para salvar

**Estimativa:** 1h

---

### T006 – Corrigir contraste muted-foreground no dark mode
**Status:** COMPLETED
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/app/globals.css`

**Descrição:** `--muted-foreground: #64748B` no dark mode sobre backgrounds `#1A1A2E` e `#0F0F1E` tem contraste ~3.5:1, abaixo do WCAG AA (4.5:1) para texto normal. Bumpar para `#94A3B8` (~5.1:1).

**Critérios de Aceite:**
- [ ] `--muted-foreground` dark atualizado para valor com ≥4.5:1 sobre `--card` dark
- [ ] Verificar visualmente que subtextos/labels secundários permanecem legíveis

**Estimativa:** 0.25h
