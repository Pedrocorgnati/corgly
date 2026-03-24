# Forms Audit — Corgly
> Gerado: 2026-03-22

---

### T001 – `API` não importado em `register-form.tsx` [CRÍTICO]
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/register-form.tsx`

**Descrição:** `register-form.tsx` usa `API.AUTH.REGISTER` na linha 43 mas não importa `API` de `@/lib/constants/routes`. Causa ReferenceError em runtime ao tentar registrar.
**Critérios de Aceite:** `import { ROUTES, API }` presente; build sem erro.
**Estimativa:** 0.25h

---

### T002 – `aria-invalid` + `aria-describedby` ausentes nas inputs RHF [ACESSIBILIDADE]
**Tipo:** PARALLEL-GROUP-A
**Dependências:** T001
**Arquivos:**
- modificar: `src/components/auth/login-form.tsx`
- modificar: `src/components/auth/register-form.tsx`
- modificar: `src/components/auth/forgot-password-form.tsx`
- modificar: `src/components/auth/profile-form.tsx`
- modificar: `src/app/(public)/auth/reset-password/page.tsx`
- modificar: `src/app/(public)/auth/resend-confirmation/page.tsx`
- modificar: `src/components/session/feedback-form.tsx`

**Descrição:** O componente `Input` usa `aria-invalid:border-destructive` via Tailwind, mas nenhum formulário baseado em react-hook-form passa `aria-invalid={!!errors.field}` nem `aria-describedby` apontando para o `<p>` de erro. Screen readers não anunciam os erros. O padrão correto já está implementado em `credit-adjust-form.tsx` e deve ser replicado.
**Critérios de Aceite:**
- Cada `<Input>` com validação recebe `aria-invalid={!!errors.field}`
- `aria-describedby="{field}-error"` presente quando há erro
- `<p>` de erro tem `id="{field}-error"` correspondente
- Role `alert` mantido nas mensagens de erro
**Estimativa:** 1.5h

---

### T003 – `mode: 'onBlur'` ausente em todos os formulários RHF [UX]
**Tipo:** PARALLEL-GROUP-A
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/login-form.tsx`
- modificar: `src/components/auth/register-form.tsx`
- modificar: `src/components/auth/forgot-password-form.tsx`
- modificar: `src/components/auth/profile-form.tsx`
- modificar: `src/app/(public)/auth/reset-password/page.tsx`
- modificar: `src/app/(public)/auth/resend-confirmation/page.tsx`
- modificar: `src/components/session/feedback-form.tsx`
- modificar: `src/components/admin/AvailabilityEditor.tsx`

**Descrição:** Nenhum `useForm` usa `mode: 'onBlur'` + `reValidateMode: 'onChange'`. Erros aparecem apenas após submit. UX ruim em formulários longos (ex: registro com 9 campos).
**Critérios de Aceite:**
- `useForm({ ..., mode: 'onBlur', reValidateMode: 'onChange' })` em todos os forms RHF
**Estimativa:** 0.5h

---

### T004 – Labels sem `htmlFor` nas selects de `register-form.tsx` e `profile-form.tsx` [ACESSIBILIDADE]
**Tipo:** PARALLEL-GROUP-A
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/register-form.tsx`
- modificar: `src/components/auth/profile-form.tsx`

**Descrição:** Os `<Label>` para País, Fuso horário (register) e Fuso horário, Idioma (profile) não têm `htmlFor`. Selects Radix/Base UI expõem trigger com id; é necessário adicionar `id` ao `SelectTrigger` e ligar o `htmlFor` do Label.
**Critérios de Aceite:**
- Cada Select tem `<Label htmlFor="field-id">` e `<SelectTrigger id="field-id">`
- Erro de validação exibido com `aria-describedby` linking
**Estimativa:** 0.5h

---

### T005 – `AvailabilityEditor`: inputs de horário sem label acessível, botões de dia sem `aria-pressed` [ACESSIBILIDADE]
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/admin/AvailabilityEditor.tsx`

**Descrição:**
1. Os inputs `type="time"` dentro de `.map()` (ranges) usam elementos `<input>` nativos sem label associado — deveriam usar o componente `Input` com um `aria-label` (`"Hora início da faixa N"` / `"Hora fim da faixa N"`).
2. Os botões de dia da semana não têm `aria-pressed` para indicar seleção; screen readers não sabem quais dias estão selecionados.
**Critérios de Aceite:**
- Cada input de horário recebe `aria-label` descritivo
- Botões de dia têm `aria-pressed={selectedDays?.includes(i) ?? false}`
**Estimativa:** 0.5h

---

### T006 – `DeleteAccountModal`: sem validação RHF + campo `confirmation` ausente [SEGURANÇA/UX]
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/delete-account-modal.tsx`

**Descrição:** O modal usa raw controlled state sem validação de schema. O `DeleteAccountSchema` em `auth.schema.ts` exige campo `confirmation: z.literal('EXCLUIR')` para evitar cliques acidentais, mas esse campo não foi implementado no UI. Apenas `password.trim()` é validado manualmente.
**Critérios de Aceite:**
- Modal usa `useForm` + `zodResolver(DeleteAccountSchema)`
- Campo de texto "Digite EXCLUIR para confirmar" adicionado
- Botão desabilitado até ambos os campos serem válidos
- `aria-invalid` + `aria-describedby` nos dois campos
**Estimativa:** 1h

---

### T007 – Schemas inline duplicados; deveriam usar `auth.schema.ts` [QUALIDADE]
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/login-form.tsx`
- modificar: `src/components/auth/forgot-password-form.tsx`
- modificar: `src/app/(public)/auth/resend-confirmation/page.tsx`

**Descrição:** Três formulários definem schemas Zod inline em vez de importar de `src/schemas/auth.schema.ts`:
- `login-form.tsx`: `loginSchema` → já existe `LoginSchema`
- `forgot-password-form.tsx`: schema local → já existe `ForgotPasswordSchema`
- `resend-confirmation/page.tsx`: schema local → já existe `ResendConfirmationSchema`

Nota: `reset-password/page.tsx` tem mensagens de validação mais ricas que `ResetPasswordSchema`; manter inline com comentário.
**Critérios de Aceite:**
- Imports de `auth.schema.ts` substituem schemas duplicados
- Sem mudança de comportamento
**Estimativa:** 0.5h

---

### T008 – `ProfileForm`: `preferredLanguage` não carrega do user + TIMEZONES hardcoded [QUALIDADE]
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/auth/profile-form.tsx`

**Descrição:**
1. No `reset()` (linha 59), `preferredLanguage` é fixo `'pt-BR'` — deveria ser `user.preferredLanguage ?? 'pt-BR'`
2. `TIMEZONES` é definida inline com apenas 7 opções; `register-form.tsx` importa `TIMEZONES` de `@/lib/constants/geo`. Unificar a fonte.
**Critérios de Aceite:**
- `preferredLanguage` carregado de `user.preferredLanguage`
- `TIMEZONES` importado de `@/lib/constants/geo` (removendo array local)
**Estimativa:** 0.25h

---

### T009 – Textareas com `maxLength` sem contador visual [UX]
**Tipo:** PARALLEL-GROUP-B
**Dependências:** none
**Arquivos:**
- modificar: `src/components/session/feedback-form.tsx`

**Descrição:** As textareas de feedback têm `maxLength={300}` e `maxLength={500}` mas não exibem contador de caracteres. Usuário não sabe quando está próximo do limite.
**Critérios de Aceite:**
- Contador `"{watch(field)?.length ?? 0}/{maxLength}"` abaixo de cada textarea
- Contador muda para `text-destructive` quando > 90% do limite
**Estimativa:** 0.5h

---

## Status

| Task | Status |
|------|--------|
| T001 | [x] |
| T002 | [x] |
| T003 | [x] |
| T004 | [x] |
| T005 | [x] |
| T006 | [x] |
| T007 | [x] |
| T008 | [x] |
| T009 | [x] |
