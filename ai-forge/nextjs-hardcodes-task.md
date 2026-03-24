# Hardcodes Task List — Corgly

> Gerado por `/nextjs:hardcodes` em 2026-03-22

## Contexto

O projeto já possui `src/lib/constants/` com:
- `enums.ts` — SessionStatus, UserRole, CreditType, CreditStatus, PaymentStatus, SubscriptionStatus, etc.
- `routes.ts` — ROUTES (parcial) + API (parcial)
- `index.ts` — PRICING, BOOKING_RULES, APP_NAME, APP_URL
- `stripe-prices.ts` — PACKAGE_PRICES, PACKAGE_CREDITS, PACKAGE_LABELS

O problema **não é ausência de constantes** — é que elas existem mas não são usadas de forma consistente.

---

## Grupo 1 — Corrigir Enums Incompletos (SEQUENTIAL)

### T001 - Adicionar `TRIAL` ao SubscriptionStatus
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/enums.ts`

**Descrição:**
`SubscriptionStatus` no enum não tem `TRIAL`, mas é usado em:
- `src/services/stripe.service.ts:90,366,369,379`
- `src/app/api/v1/subscriptions/cancel/route.ts:17`
- `src/app/api/v1/subscriptions/route.ts:14`
- `src/app/api/v1/subscriptions/update/route.ts:37`

**Critérios de Aceite:**
- [ ] `TRIAL: 'TRIAL'` adicionado ao `SubscriptionStatus`
- [ ] `SubscriptionStatus` exportado corretamente
- [ ] Build passando

**Estimativa:** 15min

---

## Grupo 2 — Expandir Constantes Existentes (PARALLEL-GROUP-2)

### T002 - Completar objeto `ROUTES` (adicionar rotas faltantes)
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/routes.ts`

**Descrição:**
Rotas usadas no código mas ausentes do `ROUTES`:
- `/auth/onboarding` → `ONBOARDING` (usado em `login-form.tsx:53`)
- `/support` → `SUPPORT` (usado em `SessionPageClient.tsx:371`)

**Critérios de Aceite:**
- [ ] `ONBOARDING` e `SUPPORT` adicionados ao `ROUTES`
- [ ] Sem duplicatas

**Estimativa:** 10min

### T003 - Completar objeto `API` (adicionar endpoints faltantes)
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/routes.ts`

**Descrição:**
Endpoints usados nos componentes mas ausentes do `API`:
- `/api/v1/auth/delete-account` (delete-account-modal.tsx)
- `/api/v1/auth/export-data` (lgpd-section.tsx)
- `/api/v1/auth/cookie-consent` (cookie-banner.tsx)
- `/api/v1/auth/cancel-deletion` (cancel-deletion/page.tsx)
- `/api/v1/auth/onboarding` (onboarding/route.ts)
- `/api/v1/profile` (profile-form.tsx)
- `/api/v1/checkout` (pricing-cards.tsx)
- `/api/v1/subscriptions` + `/cancel` + `/update` (useSubscription.ts)
- `/api/v1/payments` (payment-history.tsx, credit-log.tsx)
- `/api/v1/credits/manual` (credit-adjust-form.tsx)
- `/api/v1/admin/credits/notify-expiring` (ExpiringCreditsWidget.tsx)
- `/api/v1/admin/feedback/{id}/review` (FeedbackReviewButton.tsx)
- `/api/v1/content/{id}/notes` (notes-editor.tsx)
- `/api/v1/sessions/{id}/feedback` (feedback-form.tsx)
- `/api/v1/feedback/history` (FeedbackHistory.tsx)

**Critérios de Aceite:**
- [ ] Todos os endpoints acima adicionados ao `API`
- [ ] Endpoints dinâmicos como funções tipadas: `(id: string) => \`/api/v1/...\``

**Estimativa:** 20min

### T004 - Criar constante `PAGINATION`
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/index.ts`

**Descrição:**
Magic numbers de paginação espalhados:
- `limit: 10` em `history/page.tsx:20`
- `limit: 20` em `admin/students/page.tsx:29`, `admin/sessions/page.tsx:19`, `FeedbackHistory.tsx:75`, `actions/sessions.ts:38`
- `take: 10` em `admin/users/[id]/route.ts:53,59`, `admin/dashboard/route.ts:62`, `feedback.service.ts:279`
- `take: 50` em `admin/dashboard/route.ts:78`
- `take: 5` em `admin/users/[id]/route.ts:65`

**Critérios de Aceite:**
- [ ] Constante `PAGINATION` criada com `STUDENT_HISTORY`, `ADMIN_SESSIONS`, `ADMIN_STUDENTS`, `FEEDBACK_HISTORY`, `DASHBOARD_RECENT`, `DASHBOARD_UPCOMING`, `USER_DETAIL_SESSIONS`, `USER_DETAIL_PAYMENTS`, `MAX_SEARCH_RESULTS`
- [ ] Adicionada ao barrel export de `index.ts`

**Estimativa:** 15min

### T005 - Criar constante `UI_TIMING`
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/index.ts`

**Descrição:**
Timeouts UI hardcoded:
- `setTimeout(() => logout(), 2000)` em `delete-account-modal.tsx:53`
- `setTimeout(() => setShow(false), 5000)` em `payment-canceled-banner.tsx:15`
- `setTimeout(() => onComplete(), 300)` em `onboarding-slides.tsx:133`
- Health checks (5000ms, 3000ms) — manter separado pois são infra

**Critérios de Aceite:**
- [ ] `UI_TIMING` com `LOGOUT_REDIRECT`, `BANNER_AUTO_HIDE`, `ONBOARDING_TRANSITION`
- [ ] Adicionada ao barrel export

**Estimativa:** 10min

### T006 - Criar constante `STORAGE_KEYS`
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/lib/constants/index.ts`

**Descrição:**
Storage keys definidas localmente por arquivo:
- `'discount_dismissed'` em `discount-banner.tsx:7`
- `'corgly_email_confirm_banner_dismissed'` em `email-confirmation-banner.tsx:9`

**Critérios de Aceite:**
- [ ] `STORAGE_KEYS` com `SESSION.DISCOUNT_DISMISSED`, `SESSION.EMAIL_BANNER_DISMISSED`
- [ ] Adicionada ao barrel export

**Estimativa:** 10min

---

## Grupo 3 — Substituir Raw Strings por Enums nas API Routes (SEQUENTIAL)

### T007 - Usar `SessionStatus` e `UserRole` em API routes
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/app/api/v1/sessions/[id]/route.ts`
- modificar: `src/app/api/v1/sessions/[id]/signal/route.ts`
- modificar: `src/app/api/v1/stats/route.ts`
- modificar: `src/app/api/v1/admin/dashboard/route.ts`
- modificar: `src/app/api/v1/admin/users/route.ts`
- modificar: `src/app/api/v1/admin/users/[id]/route.ts`
- modificar: `src/app/api/v1/admin/students/route.ts`
- modificar: `src/app/api/v1/admin/students/[id]/route.ts`
- modificar: `src/app/api/v1/credits/route.ts`
- modificar: `src/app/api/v1/payments/route.ts`
- modificar: `src/app/api/v1/feedback/history/route.ts`
- modificar: `src/app/api/v1/feedback/progress/route.ts`
- modificar: `src/app/api/v1/sessions/bulk-cancel/route.ts`
- modificar: `src/app/api/v1/sessions/[id]/approve-reschedule/route.ts`
- modificar: `src/middleware.ts`
- modificar: `src/app/api/health/detail/route.ts`

**Descrição:**
Substituir strings como `'ADMIN'`, `'STUDENT'`, `'COMPLETED'`, `'IN_PROGRESS'`, `'SCHEDULED'`
por `UserRole.ADMIN`, `UserRole.STUDENT`, `SessionStatus.COMPLETED`, etc.

**Critérios de Aceite:**
- [ ] Zero raw string comparisons `=== 'ADMIN'` ou `=== 'STUDENT'` em rotas API
- [ ] Zero raw string comparisons com SessionStatus em rotas API
- [ ] Imports adicionados onde necessário

**Estimativa:** 30min

### T008 - Usar `SubscriptionStatus` em subscription routes e stripe.service
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/app/api/v1/subscriptions/route.ts`
- modificar: `src/app/api/v1/subscriptions/cancel/route.ts`
- modificar: `src/app/api/v1/subscriptions/update/route.ts`
- modificar: `src/services/stripe.service.ts`
- modificar: `src/components/billing/subscription-manager.tsx`

**Descrição:**
Substituir `'ACTIVE'`, `'TRIAL'`, `'PAST_DUE'`, `'CANCELLED'` por `SubscriptionStatus.*`

**Critérios de Aceite:**
- [ ] Zero raw SubscriptionStatus strings
- [ ] `SubscriptionStatus.TRIAL` adicionado após T001

**Estimativa:** 20min

### T009 - Usar `SessionStatus` em services e components
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/services/session.service.ts`
- modificar: `src/components/session/SessionPageClient.tsx` (status comparisons only)

**Descrição:**
`session.status === 'INTERRUPTED'` → `session.status === SessionStatus.INTERRUPTED`
`status: 'COMPLETED'` em apiClient.patch → `status: SessionStatus.COMPLETED`

**Critérios de Aceite:**
- [ ] Zero raw SessionStatus strings em services e components
- [ ] `pageState` strings (ACTIVE, AUDIO_ONLY, INTERRUPTED, ENDED) — manter como estão (são pageState local, não SessionStatus)

**Estimativa:** 15min

### T010 - Usar `UserRole` em layout e components
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/app/(student)/layout.tsx`
- modificar: `src/components/shared/app-header.tsx`
- modificar: `src/components/session/SessionPageClient.tsx` (role check only)

**Descrição:**
`user.role === 'ADMIN'` → `user.role === UserRole.ADMIN`

**Critérios de Aceite:**
- [ ] Zero raw role strings em layouts e components

**Estimativa:** 10min

---

## Grupo 4 — Substituir API Strings nos Componentes (SEQUENTIAL)

### T011 - Usar `API` constant em hooks
**Tipo:** SEQUENTIAL
**Dependências:** T003
**Arquivos:**
- modificar: `src/hooks/useAuth.ts`
- modificar: `src/hooks/useSubscription.ts`
- modificar: `src/hooks/useCredits.ts`

**Descrição:**
`apiClient.get('/api/v1/auth/me')` → `apiClient.get(API.AUTH.ME)`

**Critérios de Aceite:**
- [ ] Todos os hooks usando constante API

**Estimativa:** 15min

### T012 - Usar `API` constant em components (auth)
**Tipo:** SEQUENTIAL
**Dependências:** T003
**Arquivos:**
- modificar: `src/components/auth/register-form.tsx`
- modificar: `src/components/auth/delete-account-modal.tsx`
- modificar: `src/components/auth/lgpd-section.tsx`
- modificar: `src/components/auth/profile-form.tsx`
- modificar: `src/components/shared/email-confirmation-banner.tsx`
- modificar: `src/app/(public)/auth/cancel-deletion/page.tsx`
- modificar: `src/components/ui/cookie-banner.tsx`

**Critérios de Aceite:**
- [ ] Zero raw API strings em componentes auth

**Estimativa:** 20min

### T013 - Usar `API` constant em components (billing, admin, session)
**Tipo:** SEQUENTIAL
**Dependências:** T003
**Arquivos:**
- modificar: `src/components/billing/credit-breakdown.tsx`
- modificar: `src/components/billing/payment-history.tsx`
- modificar: `src/components/student/pricing-cards.tsx`
- modificar: `src/components/admin/BulkBlockModal.tsx`
- modificar: `src/components/admin/credit-adjust-form.tsx`
- modificar: `src/components/admin/AvailabilityEditor.tsx`
- modificar: `src/components/admin/ExpiringCreditsWidget.tsx`
- modificar: `src/components/admin/FeedbackReviewButton.tsx`
- modificar: `src/components/content/notes-editor.tsx`
- modificar: `src/components/session/feedback-form.tsx`
- modificar: `src/components/progress/FeedbackHistory.tsx`

**Critérios de Aceite:**
- [ ] Zero raw API strings em componentes billing, admin, session

**Estimativa:** 25min

---

## Grupo 5 — Substituir ROUTES Strings nos Componentes (SEQUENTIAL)

### T014 - Usar `ROUTES` constant onde não está sendo usado
**Tipo:** SEQUENTIAL
**Dependências:** T002
**Arquivos:**
- modificar: `src/components/session/SessionPageClient.tsx` (href hardcodes)
- modificar: `src/components/calendar/BookingConfirmModal.tsx`
- modificar: `src/app/(student)/session/[id]/error.tsx`
- modificar: `src/app/(public)/content/[id]/error.tsx`
- modificar: `src/app/(minimal)/session/[id]/page.tsx`
- modificar: `src/app/global-error.tsx`
- modificar: `src/app/(admin)/admin/sessions/[id]/page.tsx`
- modificar: `src/app/(admin)/admin/sessions/[id]/error.tsx`
- modificar: `src/app/(admin)/admin/feedback/[sessionId]/error.tsx`
- modificar: `src/components/auth/login-form.tsx`
- modificar: `src/components/student/calendar-schedule.tsx`
- modificar: `src/app/(public)/auth/confirm-email/page.tsx`
- modificar: `src/app/(student)/progress/page.tsx` (API href)

**Critérios de Aceite:**
- [ ] Zero href/redirect/router.push com strings literais

**Estimativa:** 25min

---

## Grupo 6 — Substituir Pagination e Storage (SEQUENTIAL)

### T015 - Usar `PAGINATION` constant
**Tipo:** SEQUENTIAL
**Dependências:** T004
**Arquivos:**
- modificar: `src/app/(student)/history/page.tsx`
- modificar: `src/app/(admin)/admin/students/page.tsx`
- modificar: `src/app/(admin)/admin/sessions/page.tsx`
- modificar: `src/components/progress/FeedbackHistory.tsx`
- modificar: `src/actions/sessions.ts`
- modificar: `src/app/api/v1/admin/users/[id]/route.ts`
- modificar: `src/app/api/v1/admin/dashboard/route.ts`
- modificar: `src/services/feedback.service.ts`

**Critérios de Aceite:**
- [ ] Zero magic numbers de paginação

**Estimativa:** 20min

### T016 - Usar `STORAGE_KEYS` constant
**Tipo:** SEQUENTIAL
**Dependências:** T006
**Arquivos:**
- modificar: `src/components/student/discount-banner.tsx`
- modificar: `src/components/shared/email-confirmation-banner.tsx`

**Critérios de Aceite:**
- [ ] Constantes locais removidas, usando `STORAGE_KEYS.*`

**Estimativa:** 10min

### T017 - Usar `UI_TIMING` constant
**Tipo:** SEQUENTIAL
**Dependências:** T005
**Arquivos:**
- modificar: `src/components/auth/delete-account-modal.tsx`
- modificar: `src/components/student/payment-canceled-banner.tsx`
- modificar: `src/components/onboarding/onboarding-slides.tsx`

**Critérios de Aceite:**
- [ ] Zero magic numbers de timeout em UI components

**Estimativa:** 10min
