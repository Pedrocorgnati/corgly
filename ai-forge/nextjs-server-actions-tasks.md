# Server Actions — Task List

> Gerado por: `/nextjs:server-actions .claude/projects/corgly.json`
> Data: 2026-03-22

---

### T001 — Remover `submitFeedback` (dead code com spread inseguro)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** [ ] TODO

**Arquivos:**
- modificar: `src/actions/sessions.ts`

**Problema:**
`submitFeedback(sessionId, data: unknown)` aceita dado arbitrário e faz spread livre no body da requisição sem validação alguma (`...(data as Record<string, unknown>)`). Isto permite sobrescrever `sessionId` e injetar campos arbitrários no payload da API.

**Evidência:**
```
rg -n "submitFeedback" src/
src/actions/sessions.ts:90:export async function submitFeedback(sessionId: string, data: unknown) {
src/actions/sessions.ts:93:    body: JSON.stringify({ sessionId, ...(data as Record<string, unknown>) }),
```
Nenhum componente importa esta função — é dead code.

**Critérios de Aceite:**
- [ ] Função `submitFeedback` removida de `sessions.ts`
- [ ] Nenhuma importação quebrada (confirmado via grep)

**Estimativa:** 0.25h

---

### T002 — Adicionar role guard a admin actions

**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** [ ] TODO

**Arquivos:**
- modificar: `src/actions/admin-dashboard.ts`
- modificar: `src/actions/admin-students.ts`

**Problema:**
`getAdminDashboard()`, `getAdminStudents()`, `getAdminStudentDetail()`, `getSessionFeedback()` não verificam sessão nem role `ADMIN` no nível da action. Auth existe apenas no middleware e na API route — ausência de defense-in-depth.

**Evidência:**
```
rg -n '"use server"' src/actions/admin-dashboard.ts src/actions/admin-students.ts
# Nenhuma dessas funções chama getSession()
```
Middleware enforça em `src/middleware.ts:125`: `if (isAdminOnly && payload.role !== 'ADMIN')` mas as actions podem ser invocadas diretamente via imports em RSC fora do grupo `(admin)`.

**Critérios de Aceite:**
- [ ] `getAdminDashboard()` verifica `session.user.role === 'ADMIN'`
- [ ] `getAdminStudents()`, `getAdminStudentDetail()`, `getSessionFeedback()` verificam role
- [ ] Retorna `{ data: null, error: 'Unauthorized' }` se role inválido
- [ ] `getSession` importado de `@/lib/auth/session`

**Estimativa:** 0.5h

---

### T003 — Sanitizar mensagem de erro em `onboarding.actions.ts`

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** [ ] TODO

**Arquivos:**
- modificar: `src/actions/onboarding.actions.ts`

**Problema:**
Linha 43: `throw new Error('completeOnboarding failed with status ${res.status}')` — expõe código HTTP interno ao caller/logs de erro do cliente.

**Evidência:**
```
rg -n "res.status" src/actions/onboarding.actions.ts
src/actions/onboarding.actions.ts:43:    throw new Error(`completeOnboarding failed with status ${res.status}`);
```

**Critérios de Aceite:**
- [ ] Mensagem de erro genérica: `'Falha ao completar onboarding. Tente novamente.'`
- [ ] Status code logado apenas no servidor: `console.error('[completeOnboarding] status:', res.status)`

**Estimativa:** 0.1h

---

### T004 — `CancelConfirmDialog`: substituir `isSubmitting` por `useTransition`

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** [ ] TODO

**Arquivos:**
- modificar: `src/components/calendar/CancelConfirmDialog.tsx`

**Problema:**
`handleCancel` usa `useState(isSubmitting)` manual. Em React 19 / Next.js App Router, chamar async server actions em event handlers sem `startTransition` não integra com o sistema de transições do React (blocking, sem isPending nativo).

**Evidência:**
```
rg -n "isSubmitting\|setIsSubmitting" src/components/calendar/CancelConfirmDialog.tsx
src/components/calendar/CancelConfirmDialog.tsx:25:  const [isSubmitting, setIsSubmitting] = useState(false);
src/components/calendar/CancelConfirmDialog.tsx:34:  const handleCancel = async () => {
src/components/calendar/CancelConfirmDialog.tsx:35:    setIsSubmitting(true);
src/components/calendar/CancelConfirmDialog.tsx:45:    } finally {
src/components/calendar/CancelConfirmDialog.tsx:46:      setIsSubmitting(false);
```

**Critérios de Aceite:**
- [ ] `useTransition` substituindo `useState(isSubmitting)`
- [ ] `isPending` usado em lugar de `isSubmitting`
- [ ] Comportamento de UX preservado (toast, onCancelled callback)

**Estimativa:** 0.25h
