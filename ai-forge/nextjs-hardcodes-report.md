# Relatório: Centralização de Hardcodes — Corgly

**Data:** 2026-03-22
**Workspace:** `output/workspace/corgly`
**Config:** `.claude/projects/corgly.json`

---

## 1. Resumo Executivo

| Categoria | Encontrados | Corrigidos | Status |
|-----------|-------------|------------|--------|
| Status/Roles (enums) | 47 | 47 | ✅ |
| Rotas de navegação | 18 | 18 | ✅ |
| Caminhos de API | 31 | 31 | ✅ |
| Magic numbers (paginação) | 9 | 9 | ✅ |
| Magic numbers (timing) | 3 | 3 | ✅ |
| Storage keys | 2 | 2 | ✅ |
| **TOTAL** | **110** | **110** | **✅** |

---

## 2. Constantes Existentes (pré-auditoria)

O projeto já possuía uma base de constantes em `src/lib/constants/`:

| Arquivo | Conteúdo | Estado pré-auditoria |
|---------|----------|----------------------|
| `enums.ts` | SessionStatus, UserRole, SubscriptionStatus, CreditType | Incompleto — faltava `TRIAL` |
| `routes.ts` | ROUTES parcial + API parcial (~8 endpoints) | Incompleto — ~25 endpoints sem cobertura |
| `index.ts` | PRICING, BOOKING_RULES, APP_NAME | Sem PAGINATION, UI_TIMING, STORAGE_KEYS |
| `stripe-prices.ts` | PACKAGE_PRICES, PACKAGE_CREDITS, PACKAGE_LABELS | Completo ✅ |

---

## 3. Alterações em Constantes

### 3.1 `src/lib/constants/enums.ts`
- **Adicionado:** `TRIAL: 'TRIAL'` ao `SubscriptionStatus`
- **Motivo:** Valor usado em 8 arquivos mas ausente do enum

### 3.2 `src/lib/constants/routes.ts` — Reescrita completa
**ROUTES expandido:**
- Adicionados: `ONBOARDING`, `SUPPORT`, `RESEND_CONFIRMATION`, `CANCEL_DELETION`, `CONTENT`, `CONTENT_DETAIL`, `MAINTENANCE`

**API expandido (de ~8 para 35+ endpoints):**
```
AUTH.ME, AUTH.LOGIN, AUTH.LOGOUT, AUTH.REGISTER, AUTH.RESEND_CONFIRMATION,
AUTH.DELETE_ACCOUNT, AUTH.EXPORT_DATA, AUTH.COOKIE_CONSENT, AUTH.CANCEL_DELETION,
PROFILE, SESSION(id), SESSION_FEEDBACK(id), SESSIONS_BULK_CANCEL,
CHECKOUT, PAYMENTS, SUBSCRIPTIONS, SUBSCRIPTIONS_CANCEL, SUBSCRIPTIONS_UPDATE,
FEEDBACK_HISTORY, FEEDBACK_PROGRESS, AVAILABILITY, AVAILABILITY_SLOT(id),
AVAILABILITY_BLOCK(id), CONTENT_NOTES(id), CREDITS, CREDITS_MANUAL,
ADMIN.DASHBOARD, ADMIN.STUDENTS, ADMIN.STUDENT(id), ADMIN.FEEDBACK(id),
ADMIN.SESSIONS, ADMIN.USERS, ADMIN.USERS_BY_ID(id), ADMIN.CREDITS,
ADMIN.CREDITS_NOTIFY_EXPIRING, ADMIN.SESSIONS_APPROVE_RESCHEDULE(id)
```

### 3.3 `src/lib/constants/index.ts` — Novas constantes adicionadas
```typescript
PAGINATION = {
  STUDENT_HISTORY: 10, ADMIN_SESSIONS: 20, ADMIN_STUDENTS: 20,
  FEEDBACK_HISTORY: 20, DASHBOARD_RECENT: 10, DASHBOARD_UPCOMING: 50,
  USER_DETAIL_SESSIONS: 10, USER_DETAIL_PAYMENTS: 10,
  USER_DETAIL_TOP_SESSIONS: 5, MAX_SEARCH_RESULTS: 100, DEFAULT: 20,
}

UI_TIMING = {
  LOGOUT_REDIRECT: 2_000,
  BANNER_AUTO_HIDE: 5_000,
  ONBOARDING_TRANSITION: 300,
}

STORAGE_KEYS = {
  SESSION: {
    DISCOUNT_DISMISSED: 'discount_dismissed',
    EMAIL_BANNER_DISMISSED: 'corgly_email_confirm_banner_dismissed',
  },
}
```

---

## 4. Arquivos Modificados

### 4.1 API Routes (T007)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/app/api/v1/sessions/[id]/route.ts` | SessionStatus.*, UserRole.ADMIN |
| `src/app/api/v1/sessions/[id]/signal/route.ts` | SessionStatus.* |
| `src/app/api/v1/stats/route.ts` | SessionStatus.*, UserRole.ADMIN |
| `src/app/api/v1/admin/dashboard/route.ts` | SessionStatus.*, UserRole.*, PAGINATION.* |
| `src/app/api/v1/admin/users/route.ts` | UserRole.STUDENT |
| `src/app/api/v1/admin/users/[id]/route.ts` | SessionStatus.*, PAGINATION.* |
| `src/app/api/v1/admin/students/route.ts` | UserRole.STUDENT |
| `src/app/api/v1/admin/students/[id]/route.ts` | UserRole.STUDENT |
| `src/app/api/v1/credits/route.ts` | UserRole.ADMIN |
| `src/app/api/v1/payments/route.ts` | UserRole.ADMIN |
| `src/app/api/v1/feedback/history/route.ts` | UserRole.ADMIN |
| `src/app/api/v1/feedback/progress/route.ts` | UserRole.ADMIN |
| `src/app/api/v1/sessions/bulk-cancel/route.ts` | UserRole.ADMIN |
| `src/app/api/v1/sessions/[id]/approve-reschedule/route.ts` | UserRole.ADMIN |
| `src/middleware.ts` | UserRole.ADMIN |
| `src/app/api/health/detail/route.ts` | UserRole.ADMIN |

### 4.2 Subscriptions + Stripe (T008)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/app/api/v1/subscriptions/route.ts` | SubscriptionStatus.ACTIVE/TRIAL/PAST_DUE |
| `src/app/api/v1/subscriptions/cancel/route.ts` | SubscriptionStatus.* |
| `src/app/api/v1/subscriptions/update/route.ts` | SubscriptionStatus.ACTIVE/TRIAL |
| `src/services/stripe.service.ts` | SubscriptionStatus.* (mapSubscriptionStatus) |
| `src/components/billing/subscription-manager.tsx` | SubscriptionStatus.ACTIVE |

### 4.3 Services + Session Components (T009-T010)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/services/session.service.ts` | SessionStatus.* (bulk) |
| `src/components/session/SessionPageClient.tsx` | SessionStatus.*, UserRole.*, API.*, ROUTES.* |
| `src/app/(student)/layout.tsx` | UserRole.ADMIN/STUDENT |
| `src/components/shared/app-header.tsx` | UserRole.ADMIN |

### 4.4 Hooks (T011)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/hooks/useAuth.ts` | API.AUTH.ME, API.AUTH.LOGIN, API.AUTH.LOGOUT, ROUTES.LOGIN |
| `src/hooks/useSubscription.ts` | API.SUBSCRIPTIONS |
| `src/hooks/useCredits.ts` | API.CREDITS |

### 4.5 Auth Components + Pages (T012)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/components/auth/register-form.tsx` | API.AUTH.REGISTER |
| `src/components/auth/delete-account-modal.tsx` | API.AUTH.DELETE_ACCOUNT, UI_TIMING.LOGOUT_REDIRECT |
| `src/components/auth/lgpd-section.tsx` | API.AUTH.EXPORT_DATA |
| `src/components/auth/profile-form.tsx` | API.PROFILE |
| `src/components/shared/email-confirmation-banner.tsx` | API.AUTH.RESEND_CONFIRMATION, STORAGE_KEYS.SESSION.EMAIL_BANNER_DISMISSED |
| `src/app/(public)/auth/cancel-deletion/page.tsx` | API.AUTH.CANCEL_DELETION |
| `src/components/ui/cookie-banner.tsx` | API.AUTH.COOKIE_CONSENT |

### 4.6 Billing + Admin Components (T013)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/components/billing/credit-breakdown.tsx` | API.CREDITS |
| `src/components/billing/payment-history.tsx` | API.PAYMENTS |
| `src/components/student/pricing-cards.tsx` | API.CHECKOUT |
| `src/components/admin/BulkBlockModal.tsx` | API.SESSIONS_BULK_CANCEL |
| `src/components/admin/credit-adjust-form.tsx` | API.CREDITS_MANUAL |
| `src/components/admin/AvailabilityEditor.tsx` | API.AVAILABILITY, API.AVAILABILITY_SLOT(id) |
| `src/components/admin/ExpiringCreditsWidget.tsx` | API.ADMIN.CREDITS_NOTIFY_EXPIRING |
| `src/components/admin/FeedbackReviewButton.tsx` | API.ADMIN.FEEDBACK(id) |
| `src/components/content/notes-editor.tsx` | API.CONTENT_NOTES(id) |
| `src/components/session/feedback-form.tsx` | API.SESSION_FEEDBACK(id) |
| `src/components/progress/FeedbackHistory.tsx` | API.FEEDBACK_HISTORY, PAGINATION.FEEDBACK_HISTORY |
| `src/app/(student)/progress/page.tsx` | API.FEEDBACK_HISTORY |

### 4.7 ROUTES em Components/Pages (T014)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/components/calendar/BookingConfirmModal.tsx` | ROUTES.CREDITS |
| `src/app/(student)/session/[id]/error.tsx` | ROUTES.DASHBOARD |
| `src/app/(admin)/admin/sessions/[id]/error.tsx` | ROUTES.ADMIN_SESSIONS |
| `src/app/(admin)/admin/feedback/[sessionId]/error.tsx` | ROUTES.ADMIN_SESSIONS |
| `src/app/(public)/content/[id]/error.tsx` | ROUTES.CONTENT |
| `src/app/global-error.tsx` | ROUTES.HOME |
| `src/app/(admin)/admin/sessions/[id]/page.tsx` | ROUTES.ADMIN_SESSIONS |
| `src/components/auth/login-form.tsx` | ROUTES.ONBOARDING |
| `src/components/student/calendar-schedule.tsx` | ROUTES.HISTORY |
| `src/app/(public)/auth/confirm-email/page.tsx` | ROUTES.RESEND_CONFIRMATION |
| `src/app/(minimal)/session/[id]/page.tsx` | ROUTES.DASHBOARD |

### 4.8 Paginação, Storage e Timing (T015-T017)
| Arquivo | Hardcodes corrigidos |
|---------|---------------------|
| `src/app/(student)/history/page.tsx` | PAGINATION.STUDENT_HISTORY |
| `src/app/(admin)/admin/students/page.tsx` | PAGINATION.ADMIN_STUDENTS |
| `src/app/(admin)/admin/sessions/page.tsx` | PAGINATION.ADMIN_SESSIONS |
| `src/actions/sessions.ts` | PAGINATION.DEFAULT |
| `src/services/feedback.service.ts` | PAGINATION.DASHBOARD_RECENT |
| `src/components/shared/email-confirmation-banner.tsx` | STORAGE_KEYS.SESSION.EMAIL_BANNER_DISMISSED |
| `src/components/student/discount-banner.tsx` | STORAGE_KEYS.SESSION.DISCOUNT_DISMISSED |
| `src/components/auth/delete-account-modal.tsx` | UI_TIMING.LOGOUT_REDIRECT |
| `src/components/student/payment-canceled-banner.tsx` | UI_TIMING.BANNER_AUTO_HIDE |
| `src/components/onboarding/onboarding-slides.tsx` | UI_TIMING.ONBOARDING_TRANSITION |

---

## 5. Checklist de Verificação

### Status e Roles
- [x] Nenhum role hardcoded (`'ADMIN'`, `'STUDENT'`) — substituídos por `UserRole.*`
- [x] Nenhum SessionStatus hardcoded (`'COMPLETED'`, `'IN_PROGRESS'`, etc.) — substituídos por `SessionStatus.*`
- [x] Nenhum SubscriptionStatus hardcoded (`'ACTIVE'`, `'TRIAL'`, etc.) — substituídos por `SubscriptionStatus.*`
- [x] Types exportados e reutilizados

### Rotas e Paths
- [x] Rotas de navegação centralizadas em `ROUTES`
- [x] Paths de API centralizados em `API`
- [x] Redirects usando constantes
- [x] Rotas dinâmicas como funções tipadas (`API.SESSION(id)`, `API.ADMIN.FEEDBACK(id)`, etc.)

### Magic Numbers
- [x] Paginação centralizada em `PAGINATION`
- [x] Timeouts centralizados em `UI_TIMING`
- [x] Storage keys centralizados em `STORAGE_KEYS`

### Qualidade
- [x] Todos os arquivos de constantes tipados com `as const`
- [x] Types exportados onde apropriado
- [x] Constantes existentes estendidas (sem duplicação)

---

## 6. Veredito

**APROVADO** — Todos os 110 hardcodes identificados foram centralizados. O projeto agora utiliza consistentemente as constantes de `src/lib/constants/` em todos os pontos de consumo.

**Risco residual:** Baixo. Os tipos TypeScript garantem que qualquer divergência futura seja detectada em tempo de compilação.
