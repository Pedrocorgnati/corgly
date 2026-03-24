# Server Actions — Report

> Gerado por: `/nextjs:server-actions .claude/projects/corgly.json`
> Data: 2026-03-22
> Status: COMPLETED

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Arquivos analisados | 9 |
| Actions implementadas | 7 arquivos ativos (+ 2 stubs) |
| Issues encontrados | 4 |
| Severidade máxima | MÉDIO |
| Tasks geradas | 4 |

---

## Inventário de Actions

| Arquivo | Funções | Status |
|---------|---------|--------|
| `auth.ts` | register, login, logout, forgotPassword, resetPassword, updateProfile, getMe | STUB — não implementado |
| `admin.ts` | getAdminStats, getAdminStudents, getAdminSessions, getAdminSlots, createSlot, deleteSlot | STUB — não implementado |
| `onboarding.actions.ts` | completeOnboarding | ✅ Implementado (1 issue menor) |
| `consent.actions.ts` | saveConsentCookies | ✅ Implementado e correto |
| `sessions.ts` | getSessions, getSession, bookSession, cancelSession, rescheduleSession, submitFeedback, getAvailability | ⚠️ 1 issue alto (dead code inseguro) |
| `dashboard.ts` | getDashboardUser, getDashboardCredits, getDashboardNextSession, getDashboardProgress, getDashboardRecentFeedbacks | ✅ Implementado |
| `progress.ts` | getProgressData, getFeedbackHistory | ✅ Implementado |
| `admin-dashboard.ts` | getAdminDashboard | ⚠️ Sem role guard |
| `admin-students.ts` | getAdminStudents, getAdminStudentDetail, getSessionFeedback | ⚠️ Sem role guard |

---

## Issues Encontrados

### [MÉDIO] T001 — `submitFeedback` dead code com spread inseguro

- **Arquivo:** `src/actions/sessions.ts:90-100`
- **Comando:** `rg -n "submitFeedback" src/`
- **Problema:** `data: unknown` spread em body sem validação; nenhum componente importa a função
- **Risco:** Payload injection se chamado por outro código

### [MÉDIO] T002 — Admin actions sem role guard

- **Arquivos:** `src/actions/admin-dashboard.ts`, `src/actions/admin-students.ts`
- **Comando:** `rg -n "getSession\|role" src/actions/admin-dashboard.ts src/actions/admin-students.ts`
- **Problema:** Defense-in-depth ausente; auth só existe no middleware e API routes
- **Risco:** Se um RSC fora do grupo `(admin)` importar estas actions, sem bloqueio

### [BAIXO] T003 — `onboarding.actions.ts` expõe status HTTP

- **Arquivo:** `src/actions/onboarding.actions.ts:43`
- **Problema:** Mensagem de erro com `res.status` propagada ao caller

### [BAIXO] T004 — `CancelConfirmDialog` com `isSubmitting` manual

- **Arquivo:** `src/components/calendar/CancelConfirmDialog.tsx`
- **Problema:** Padrão não idiomático React 19 (`useState` manual vs `useTransition`)

---

## Pontos Positivos

- Estrutura `/src/actions/` bem organizada, separada de components
- `"use server"` sempre no topo do arquivo (nunca inline)
- `onboarding.actions.ts` tem IDOR protection (userId vs session.user.id)
- `consent.actions.ts` correto: fire-and-forget com fallback, LGPD compliant
- `sessions.ts` tem `revalidatePath` correto e específico após mutations
- Nenhum `redirect()` ou `notFound()` capturado em try/catch
- Nenhum erro interno exposto ao cliente nos apiFetch wrappers
- `apiFetch` helper consistente (apesar de duplicado — fora do escopo deste teste)

---

## Execução das Tasks

| Task | Status | Arquivo(s) |
|------|--------|------------|
| T001 | ✅ COMPLETED | sessions.ts |
| T002 | ✅ COMPLETED | admin-dashboard.ts, admin-students.ts |
| T003 | ✅ COMPLETED | onboarding.actions.ts |
| T004 | ✅ COMPLETED | CancelConfirmDialog.tsx |
