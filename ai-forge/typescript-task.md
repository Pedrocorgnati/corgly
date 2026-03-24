# TypeScript Audit Tasks — Corgly

Auditado em: 2026-03-22
Erros originais (pré-fix): 5 erros de compilação em `src/`
Erros pós-fix (COMPLETED): 0 erros nos arquivos que foram corrigidos
Erros pre-existentes restantes em `src/`: ~145 linhas (detalhados abaixo)

---

## ✅ COMPLETED

### T001 – useAuth.ts contém JSX em arquivo .ts
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- renomeado: `src/hooks/useAuth.ts` → `src/hooks/useAuth.tsx`

**Descrição:** O arquivo `useAuth.ts` exporta `AuthProvider` que retorna JSX (`<AuthContext value={value}>{children}</AuthContext>`), mas a extensão `.ts` não suporta sintaxe JSX. Causava 4 erros de compilação (TS1005 x2, TS1109, TS1161) na linha 98.

**Erros resolvidos:** TS1005, TS1005, TS1109, TS1161

---

### T002 – JSX closing tag errado em resend-confirmation/page.tsx
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificado: `src/app/(public)/auth/resend-confirmation/page.tsx`

**Descrição:** O return principal (linha 72) abria `<div className="min-h-[calc(100vh-64px)]...">` mas fechava com `</AuthPageWrapper>` na linha 108 — tag errada, causando TS17002.

**Fix:** `</AuthPageWrapper>` → `</div>` na linha 108.

**Erros resolvidos:** TS17002

---

### T003 – `as any` em jwt.sign expiresIn
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificado: `src/lib/auth.ts`

**Descrição:** `{ expiresIn: JWT_EXPIRES_IN as any }` usava `as any` desnecessário com eslint-disable. `JWT_EXPIRES_IN` é `string`, que é assignável a `jwt.SignOptions['expiresIn']`.

**Fix:** `JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']` — tipagem precisa sem suprimir o lint.

---

### T004 – tsconfig: `jsx` deveria ser `"preserve"`
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificado: `tsconfig.json`

**Descrição:** Next.js recomenda `"jsx": "preserve"` pois o compilador Next.js lida com a transformação JSX. O valor anterior `"react-jsx"` funcionava mas contornava o pipeline do Next.js.

**Fix:** `"jsx": "react-jsx"` → `"jsx": "preserve"`

---

## 🔴 OPEN — Alta Prioridade (quebra runtime)

### T005 – Prisma schema drift: campos obsoletos em API routes
**Tipo:** PARALLEL-GROUP-A
**Dependências:** none
**Arquivos:**
- modificar: `src/app/api/v1/admin/sessions/[id]/route.ts`
- modificar: `src/app/api/v1/admin/users/[id]/route.ts`
- modificar: `src/app/api/v1/admin/users/route.ts`
- modificar: `src/app/api/v1/admin/students/[id]/route.ts`
- modificar: `src/app/api/v1/admin/students/route.ts`
- modificar: `src/app/api/v1/auth/export-data/route.ts`

**Descrição:** Múltiplas API routes referenciam campos Prisma que foram removidos do schema em migrations:
- `clarityScore`, `didacticsScore`, `punctualityScore`, `engagementScore` → campos no `Feedback` model foram removidos
- `emailVerified`, `lastLoginAt` → campos no `User` model foram removidos
- `creditBatches` → relação no `User` model removida/renomeada
- `feedback.reviewed`, `feedback.reviewedAt` → campos removidos
- Enum `SubscriptionStatus.PAUSED`, `PaymentStatus.SUCCEEDED`, `ContentType.VIDEO`, `ContentType.ARTICLE` → valores removidos/renomeados

**Critérios de Aceite:**
- [ ] `tsc --noEmit` sem TS2339 / TS2353 nas routes listadas
- [ ] Verificar schema Prisma atual e alinhar selects/queries com campos existentes
- [ ] Campos que somem devem ser omitidos do select ou removidos da response
**Estimativa:** 4h

---

### T006 – FeedbackScores: campo names divergem entre schema e API/components
**Tipo:** PARALLEL-GROUP-A
**Dependências:** none
**Arquivos:**
- modificar: `src/app/api/v1/feedback/history/route.ts`
- modificar: `src/app/(student)/dashboard/page.tsx`
- verificar: `src/app/(student)/progress/page.tsx`
- verificar: `src/schemas/feedback.schema.ts`

**Descrição:** O tipo `FeedbackScores` exportado por `src/schemas/feedback.schema.ts` tem campos `listening/speaking/writing/vocabulary`. Porém `feedback/history/route.ts` e `dashboard/page.tsx` ainda usam os nomes antigos `clarity/didactics/punctuality/engagement`, causando TS2339 em tempo de compilação e retornos incorretos em runtime.

**Erros:** TS2339 (x8 em history/route.ts, x4 em dashboard/page.tsx)

**Critérios de Aceite:**
- [ ] `history/route.ts` retorna campos com nomes corretos do schema atual
- [ ] `dashboard/page.tsx` consome os campos corretos
- [ ] Componentes `DimensionRadar`, `ProgressCharts`, `TrendLineChart` com `FeedbackScores` local inline: consolidar em import de `@/schemas/feedback.schema.ts`
**Estimativa:** 2h

---

### T007 – Button não suporta `asChild` prop (Base UI ≠ Radix)
**Tipo:** PARALLEL-GROUP-A
**Dependências:** none
**Arquivos:**
- modificar: `src/components/calendar/BookingConfirmModal.tsx` (3 ocorrências)
- modificar: `src/app/(public)/content/[id]/error.tsx`
- modificar: `src/app/(public)/maintenance/page.tsx`
- modificar: `src/app/(public)/support/page.tsx`
- modificar: `src/app/(student)/session/[id]/error.tsx`

**Descrição:** `Button` usa `@base-ui/react/button` (Base UI), que não expõe a prop `asChild` (padrão Radix/shadcn). Passar `asChild` causa TS2345. O padrão correto para renderizar links com estilo de botão é usar `ButtonLink` (`src/components/ui/button-link.tsx`) ou wrappers nativos.

**Critérios de Aceite:**
- [ ] Nenhuma ocorrência de `<Button asChild>` no codebase
- [ ] Substituições por `<ButtonLink>` ou `<a>` com `className={buttonVariants(...)}`
- [ ] `tsc --noEmit` sem TS2345 nas páginas listadas
**Estimativa:** 1h

---

## 🟡 OPEN — Média Prioridade (missing imports / undefined names)

### T008 – Identificadores duplicados e imports faltando em componentes admin
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/components/admin/FeedbackReviewButton.tsx`
- modificar: `src/app/(admin)/admin/sessions/[id]/page.tsx`
- modificar: `src/app/(public)/auth/cancel-deletion/page.tsx`
- modificar: `src/components/auth/register-form.tsx`
- modificar: `src/components/calendar/BookingConfirmModal.tsx`
- modificar: `src/app/global-error.tsx`

**Descrição:**
- `FeedbackReviewButton.tsx`: dois imports diferentes nomeados `API` causam TS2300 (Duplicate identifier)
- `admin/sessions/[id]/page.tsx` e `global-error.tsx`: usam `ROUTES` sem importar de `@/lib/constants/routes`
- `cancel-deletion/page.tsx` e `register-form.tsx`: usam `API` sem importar
- `BookingConfirmModal.tsx`: usa `ROUTES` sem importar

**Critérios de Aceite:**
- [ ] `tsc --noEmit` sem TS2304 / TS2300 nas páginas/componentes listados
- [ ] Imports de `{ ROUTES, API }` de `@/lib/constants/routes` adicionados onde necessário
- [ ] Duplicatas em `FeedbackReviewButton.tsx` resolvidas
**Estimativa:** 1h

---

### T009 – Implicit any em callbacks e TS7006 em admin/users/route.ts
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/app/api/v1/admin/users/route.ts`

**Descrição:** Linha 82 usa parâmetros `s` e `b` sem tipo explícito em uma callback, causando TS7006 ("Parameter implicitly has 'any' type") mesmo com `strict: true`.

**Critérios de Aceite:**
- [ ] Parâmetros tipados explicitamente
- [ ] `tsc --noEmit` sem TS7006 nesta rota
**Estimativa:** 0.5h

---

### T010 – SessionStatus e SubscriptionStatus: uso de strings literais inválidas
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/app/api/v1/sessions/route.ts`
- modificar: `src/app/api/v1/sessions/[id]/route.ts`
- modificar: `src/app/api/v1/sessions/[id]/signal/route.ts`
- modificar: `src/app/api/v1/subscriptions/cancel/route.ts`
- modificar: `src/app/api/v1/subscriptions/route.ts`
- modificar: `src/app/api/v1/subscriptions/update/route.ts`
- modificar: `src/app/(admin)/admin/sessions/page.tsx`

**Descrição:**
- `sessions/route.ts`: `searchParams.get('status')` retorna `string`, sendo passado diretamente como `SessionStatus` sem narrowing
- Três subscription routes: usam literal `"TRIAL"` que não existe no enum `SubscriptionStatus`
- Session routes: comparações com unions incompletas de `SessionStatus`

**Critérios de Aceite:**
- [ ] Narrowing via type guard antes de usar `status` como `SessionStatus`
- [ ] `"TRIAL"` adicionado ao enum `SubscriptionStatus` OU removido das routes
- [ ] `tsc --noEmit` sem TS2322 / TS2345 nos arquivos listados
**Estimativa:** 2h

---

## 🟢 OPEN — Baixa Prioridade (qualidade / melhorias)

### T011 – RTCSdpInit não existe globalmente no ambiente Node/browser target
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/types/sala-virtual.ts`
- modificar: `src/app/api/v1/sessions/[id]/signal/route.ts`

**Descrição:** `RTCSdpInit` é um tipo de DOM disponível apenas quando `lib: ["dom"]` está ativo, mas API routes rodam em Node.js server context. Usar `RTCSdpInit` em routes causa TS2304. Deve ser substituído por um type local ou `{ type: string; sdp: string }`.

**Critérios de Aceite:**
- [ ] `RTCSdpInit` substituído por definição local em `sala-virtual.ts`
- [ ] Route não referencia tipos de DOM
**Estimativa:** 0.5h

---

### T012 – `noUncheckedIndexedAccess` pronto para habilitar após fix dos e2e
**Tipo:** SEQUENTIAL
**Dependências:** T011, T005, T006, T007, T008, T009, T010
**Arquivos:**
- modificar: `tsconfig.json`
- modificar: `e2e/helpers/test-users.ts` (ou similar — onde `TEST_USERS` é definido)
- modificar: todos os e2e/*.spec.ts que usam `TEST_USERS['role']`

**Descrição:** `noUncheckedIndexedAccess: true` foi testado mas causou 30+ erros nos testes e2e porque `TEST_USERS['admin']` retorna `TestUser | undefined`. O fix é tipar `TEST_USERS` como `Record<string, TestUser>` com type assertion, ou adicionar non-null assertions nos specs. Habilitar após os outros erros estarem resolvidos para ter baseline limpo.

**Critérios de Aceite:**
- [ ] `noUncheckedIndexedAccess: true` em `tsconfig.json`
- [ ] `tsc --noEmit` com 0 erros
**Estimativa:** 2h

---

### T013 – PageWrapper ausente em exports de @/components/shared
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- verificar: `src/components/shared/index.ts`
- modificar: `src/app/(admin)/admin/feedback/[sessionId]/error.tsx`
- modificar: `src/app/(admin)/admin/feedback/[sessionId]/loading.tsx`
- modificar: `src/app/(admin)/admin/sessions/[id]/page.tsx`
- modificar: `src/app/(admin)/admin/students/[id]/page.tsx`

**Descrição:** Vários componentes de admin importam `PageWrapper` de `@/components/shared` mas ele não está exportado nesse barrel. Ou `PageWrapper` precisa ser adicionado ao barrel ou os imports precisam apontar para o caminho direto.

**Critérios de Aceite:**
- [ ] `tsc --noEmit` sem TS2305 para `PageWrapper`
**Estimativa:** 0.5h

---

### T014 – `credit-adjust-form.tsx`: Zod API incompatível (invalid_type_error)
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/components/admin/credit-adjust-form.tsx`

**Descrição:** Usa `invalid_type_error` na configuração Zod, mas o Zod instalado usa API diferente (`error`/`message`). Provavelmente mismatch de versão de tipos Zod vs runtime.

**Critérios de Aceite:**
- [ ] Schema Zod compatível com a versão instalada
- [ ] `tsc --noEmit` sem TS2353 no arquivo
**Estimativa:** 0.5h

---

## Resumo

| Prioridade | Tasks | Estimativa |
|------------|-------|-----------|
| ✅ COMPLETED | T001–T004 | — |
| 🔴 Alta | T005, T006, T007 | ~7h |
| 🟡 Média | T008, T009, T010, T013, T014 | ~4.5h |
| 🟢 Baixa | T011, T012 | ~2.5h |
| **Total open** | 11 tasks | **~14h** |

---

## tsconfig final esperado

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```
