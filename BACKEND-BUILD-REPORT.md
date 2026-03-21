# Backend Build Report

Projeto: corgly
Stack: nextjs-api
Data: 2026-03-21

## Estrutura Gerada

### Models / Schemas (11 entidades)

| Arquivo | Entidade | Campos principais |
|---------|----------|-------------------|
| prisma/schema.prisma | User | id, email, passwordHash, role, timezone, tokenVersion, termsAcceptedAt |
| prisma/schema.prisma | CreditBatch | id, userId, type, totalCredits, usedCredits, expiresAt, stripePaymentIntentId |
| prisma/schema.prisma | AvailabilitySlot | id, startAt, endAt, isBlocked, version |
| prisma/schema.prisma | RecurringPattern | id, studentId, dayOfWeek, startTime, isActive |
| prisma/schema.prisma | Session | id, studentId, availabilitySlotId, status, creditBatchId, cancelledAt |
| prisma/schema.prisma | Feedback | id, sessionId, listeningScore, speakingScore, writingScore, vocabularyScore |
| prisma/schema.prisma | Payment | id, userId, stripePaymentIntentId, stripeEventId, amount, status |
| prisma/schema.prisma | Subscription | id, userId, stripeSubscriptionId, status, weeklyFrequency |
| prisma/schema.prisma | SessionDocument | id, sessionId, yjsState, plainTextSnapshot |
| prisma/schema.prisma | Content | id, title, type, youtubeUrl, language, isPublished, sortOrder |
| prisma/schema.prisma | CookieConsent | id, userId, essentialAccepted, analyticsAccepted, marketingAccepted |

### Zod Schemas (7 arquivos)

| Arquivo | Schemas |
|---------|---------|
| src/schemas/auth.schema.ts | RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, ConfirmEmailSchema, UpdateProfileSchema |
| src/schemas/session.schema.ts | BookSessionSchema, CancelSessionSchema, RescheduleSessionSchema, BulkCancelSchema, SignalSchema |
| src/schemas/feedback.schema.ts | CreateFeedbackSchema |
| src/schemas/credit.schema.ts | ManualCreditSchema |
| src/schemas/availability.schema.ts | GenerateSlotsSchema |
| src/schemas/checkout.schema.ts | CreateCheckoutSchema, CreateSubscriptionCheckoutSchema |
| src/schemas/content.schema.ts | CreateContentSchema, UpdateContentSchema |

### Routes / Controllers (30 endpoints)

| Arquivo | Endpoints |
|---------|-----------|
| src/app/api/v1/auth/route.ts | POST /api/v1/auth (register alias) |
| src/app/api/v1/auth/login/route.ts | POST /auth/login |
| src/app/api/v1/auth/logout/route.ts | POST /auth/logout |
| src/app/api/v1/auth/confirm-email/route.ts | POST /auth/confirm-email |
| src/app/api/v1/auth/forgot-password/route.ts | POST /auth/forgot-password |
| src/app/api/v1/auth/reset-password/route.ts | POST /auth/reset-password |
| src/app/api/v1/auth/me/route.ts | GET /auth/me |
| src/app/api/v1/auth/onboarding/route.ts | POST /auth/onboarding |
| src/app/api/v1/profile/route.ts | PATCH /profile |
| src/app/api/v1/credits/route.ts | GET /credits, POST /credits |
| src/app/api/v1/availability/route.ts | GET /availability, POST /availability |
| src/app/api/v1/availability/[id]/block/route.ts | PATCH /availability/:id/block |
| src/app/api/v1/availability/[id]/unblock/route.ts | PATCH /availability/:id/unblock |
| src/app/api/v1/sessions/route.ts | GET /sessions, POST /sessions |
| src/app/api/v1/sessions/[id]/route.ts | GET /sessions/:id |
| src/app/api/v1/sessions/[id]/cancel/route.ts | PATCH /sessions/:id/cancel |
| src/app/api/v1/sessions/[id]/reschedule/route.ts | PATCH /sessions/:id/reschedule |
| src/app/api/v1/sessions/[id]/approve-reschedule/route.ts | PATCH /sessions/:id/approve-reschedule |
| src/app/api/v1/sessions/[id]/signal/route.ts | GET+POST /sessions/:id/signal |
| src/app/api/v1/sessions/bulk-cancel/route.ts | POST /sessions/bulk-cancel |
| src/app/api/v1/checkout/route.ts | POST /checkout |
| src/app/api/v1/subscriptions/cancel/route.ts | POST /subscriptions/cancel |
| src/app/api/v1/feedback/route.ts | GET+POST /feedback |
| src/app/api/v1/feedback/progress/route.ts | GET /feedback/progress |
| src/app/api/v1/admin/sessions/route.ts | GET /admin/sessions |
| src/app/api/v1/admin/students/route.ts | GET /admin/students |
| src/app/api/v1/admin/students/[id]/route.ts | GET+PATCH /admin/students/:id |
| src/app/api/v1/content/route.ts | GET+POST /content |
| src/app/api/v1/content/[id]/route.ts | PATCH+DELETE /content/:id |
| src/app/api/v1/webhooks/stripe/route.ts | POST /webhooks/stripe |

### Middlewares

- auth: `src/middleware.ts` — JWT httpOnly cookie + Bearer fallback, role injection via x-user-* headers
- validate: Zod `safeParse` em todos os endpoints (inline nos route handlers)
- rate-limit: `src/lib/rate-limit.ts` — in-memory, configurado por rota (AUTH_LOGIN, AUTH_REGISTER, AUTH_FORGOT, SESSIONS_CREATE, WEBHOOK, GENERAL)

### Services (8 arquivos)

| Arquivo | Métodos |
|---------|---------|
| src/services/auth.service.ts | register, login, confirmEmail, forgotPassword, resetPassword, getMe, updateProfile, completeOnboarding |
| src/services/credit.service.ts | getBalance, consumeFEFO, refund, createBatch, addManualCredits, checkExpiring, expireCredits |
| src/services/session.service.ts | create, cancel, reschedule, approveReschedule, bulkCancel, listByStudent, listAll, getById, autoConfirm, postSignal, pollSignals |
| src/services/availability.service.ts | getAvailable, generateSlots, blockSlot, unblockSlot |
| src/services/stripe.service.ts | createCheckoutSession, createSubscriptionCheckout, cancelSubscription, handleWebhook, constructEvent |
| src/services/feedback.service.ts | create, getBySession, getProgress |
| src/services/content.service.ts | list, create, update, delete |
| src/services/email.service.ts | send (10 EmailTypes) |

### Testes (3 arquivos)

- src/services/__tests__/auth.service.test.ts
- src/services/__tests__/credit.service.test.ts
- src/services/__tests__/session.service.test.ts

## Libs Auxiliares

- `src/lib/prisma.ts` — PrismaClient singleton (dev hot-reload safe)
- `src/lib/auth.ts` — signJWT, verifyJWT, hashPassword, comparePassword, setAuthCookie, clearAuthCookie, apiResponse
- `src/lib/rate-limit.ts` — in-memory rate limiter com configs por rota

## Stubs Pendentes

Os métodos abaixo são stubs marcados com TODO e precisam de implementação:

**AuthService:** register, login, confirmEmail, forgotPassword, resetPassword, updateProfile, completeOnboarding
**CreditService:** consumeFEFO, refund, createBatch, addManualCredits, expireCredits
**SessionService:** create, cancel, reschedule, approveReschedule, bulkCancel, getById, autoConfirm
**AvailabilityService:** generateSlots, blockSlot, unblockSlot
**StripeService:** createCheckoutSession, createSubscriptionCheckout, cancelSubscription, handleWebhook
**FeedbackService:** create
**ContentService:** create, update, delete
**EmailService:** send (conectar ao provedor — Resend recomendado)

Execute `/auto-flow execute [range_de_modules]` para implementar a lógica de negócio.

## Notas Técnicas

- **Prisma**: Downgraded para v5 (MySQL completo). Prisma v7 não suporta adapter MySQL ainda.
- **Rate Limiting**: In-memory para MVP. Substituir por `@upstash/ratelimit` em produção.
- **WebRTC Signaling**: In-memory Map no SessionService. Substituir por Redis em produção.
- **JWT**: httpOnly cookie + Bearer header fallback. Invalidação via `tokenVersion` no User.
- **FEFO**: Algoritmo documentado no CreditService.consumeFEFO com comentários de implementação.
- **Stripe API**: Versão `2026-02-25.clover` (latest instalado).

## Próximos Passos

1. `/env-creation` — configurar variáveis de ambiente (.env)
2. `/db-migration-create` — gerar migrations Prisma
3. `/create-test-user` — criar usuários de teste
4. `/auto-flow execute` — implementar lógica de negócio task a task
