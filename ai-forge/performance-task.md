# Performance Tasks — Corgly

> Gerado em: 2026-03-22
> Auditoria: `/nextjs:performance`

---

### T001 – Instalar e instrumentar web-vitals
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `package.json`
- modificar: `src/app/layout.tsx`

**Descrição:** Nenhuma métrica de Core Web Vitals (LCP, CLS, INP, FCP, TTFB) está sendo medida. Sem esse dado, não é possível validar o impacto de otimizações ou detectar regressões em produção.

**Critérios de Aceite:**
- [ ] `web-vitals` instalado (`npm i web-vitals`)
- [ ] Callbacks `onCLS`, `onLCP`, `onINP`, `onFCP`, `onTTFB` registrados no root layout
- [ ] Métricas enviadas via `navigator.sendBeacon` para endpoint de analytics
- [ ] Console log em dev para visualização rápida

**Estimativa:** 1h

---

### T002 – Corrigir keys de índice em skeletons e listas
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/components/dashboard/page.tsx` (linha 60)
- modificar: `src/components/landing/testimonials-section.tsx` (linha 63)
- modificar: `src/app/(admin)/admin/students/page.tsx` (linha 175)
- modificar: todos os `loading.tsx` com `Array.from(...).map((_, i) => ... key={i})`

**Descrição:** Múltiplos componentes de loading/skeleton usam `key={i}` (índice do array) como chave React. Embora em skeletons o impacto seja menor (sem estado interno por item), é uma má prática que pode mascarar bugs de reconciliação se convertidos em listas reais.

**Critérios de Aceite:**
- [ ] Todos os `Array.from().map` com `key={i}` substituídos por `key={`skeleton-${i}`}` ou equivalente semântico
- [ ] Nenhum `key={index}` em listas com dados reais (não-skeleton)
- [ ] `npm run lint` sem warnings de keys

**Estimativa:** 1h

---

### T003 – Lazy-load Recharts (ProgressCharts, TrendLineChart, DimensionRadar)
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/app/(student)/progress/page.tsx` (ou onde os charts são importados)
- modificar: `src/components/progress/ProgressCharts.tsx`
- modificar: `src/components/progress/TrendLineChart.tsx`
- modificar: `src/components/progress/DimensionRadar.tsx`

**Descrição:** Os componentes Recharts são importados de forma estática e incluídos no bundle principal. Recharts é uma lib pesada (~300KB). Carregá-los via `dynamic()` com `{ ssr: false }` move-os para chunk separado, reduzindo o JS inicial da rota `/progress`.

**Critérios de Aceite:**
- [ ] `dynamic(() => import(...), { ssr: false })` aplicado nos 3 componentes de chart
- [ ] Suspense fallback (skeleton de gráfico) adicionado
- [ ] `npm run build` mostra chunks separados para charts
- [ ] Bundle do chunk `/progress` reduzido (registrar antes/depois)

**Estimativa:** 1.5h

---

### T004 – Lazy-load CorglyCircle no Dashboard
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `src/app/(student)/dashboard/page.tsx`
- modificar: `src/components/dashboard/CorglyCircle.tsx`

**Descrição:** O RadarChart do dashboard carrega Recharts no bundle principal da rota `/dashboard`. Dynamic import reduz o JS inicial da rota mais visitada.

**Critérios de Aceite:**
- [ ] `dynamic(() => import('../CorglyCircle'), { ssr: false })` aplicado
- [ ] Fallback de skeleton adicionado durante carregamento
- [ ] Métricas LCP do dashboard registradas antes/depois

**Estimativa:** 0.5h

---

### T005 – Lazy-load integração Stripe nos formulários de pagamento
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: rotas/componentes que importam `stripe` ou `@stripe/stripe-js`

**Descrição:** O SDK do Stripe está sendo carregado globalmente. Isso adiciona ~100KB ao bundle inicial de rotas que não precisam de pagamento. O carregamento deve ser postergado para o momento em que o usuário acessa o checkout.

**Critérios de Aceite:**
- [ ] `loadStripe` chamado via `dynamic()` ou dentro de `useEffect` somente nas rotas de billing/checkout
- [ ] Bundle da home e dashboard sem referência ao Stripe JS
- [ ] Fluxo de checkout testado e funcional após a mudança

**Estimativa:** 1.5h

---

### T006 – Dividir AuthContext em state e dispatch
**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/hooks/useAuth.ts`
- modificar: `src/providers/AuthProvider.tsx` (ou equivalente)
- modificar: todos os consumidores de `useAuth()`

**Descrição:** O `AuthContext` expõe um objeto único com dados do usuário e funções (`UseAuthReturn`). Qualquer mudança no user data (ex: créditos atualizados) causa re-render em todos os componentes que consomem `useAuth()`, mesmo os que só precisam de funções estáticas (ex: `logout`).

**Critérios de Aceite:**
- [ ] Context dividido em `AuthStateContext` (user, session, isLoading) e `AuthActionsContext` (login, logout, refresh)
- [ ] Componentes que só usam ações não re-renderizam quando o estado muda
- [ ] Testes de autenticação passando

**Estimativa:** 2h

---

### T007 – Adicionar @next/bundle-analyzer e script de análise
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `package.json`
- modificar: `next.config.ts`

**Descrição:** Sem bundle analyzer, não é possível medir o impacto das otimizações de bundle (T003–T005) nem detectar regressões futuras.

**Critérios de Aceite:**
- [ ] `@next/bundle-analyzer` instalado como devDependency
- [ ] `ANALYZE=true next build` configurado em script `npm run analyze`
- [ ] `next.config.ts` atualizado com wrapper do analyzer
- [ ] Primeiro relatório gerado e tamanho dos chunks documentado aqui

**Estimativa:** 0.5h

---

### T008 – Configurar modularizeImports no next.config
**Tipo:** PARALLEL-GROUP-2
**Dependências:** T007
**Arquivos:**
- modificar: `next.config.ts`

**Descrição:** Sem `modularizeImports`, imports como `import { X } from 'lucide-react'` podem não ter tree-shaking ideal em todos os cenários. A configuração força importações granulares.

**Critérios de Aceite:**
- [ ] `modularizeImports` configurado para `lucide-react` e quaisquer outras libs suportadas
- [ ] `npm run analyze` mostra redução no tamanho do bundle de ícones

**Estimativa:** 0.5h

---

### T009 – Adicionar useTransition em submissões de formulário
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: formulários de login, onboarding, configurações de perfil

**Descrição:** Submissões de formulário que disparam mutações de API bloqueiam o thread principal durante a atualização de estado. `useTransition` permite que o input do usuário permaneça responsivo enquanto a atualização acontece em background.

**Critérios de Aceite:**
- [ ] `isPending` de `useTransition` usado para estado de loading nos botões de submit
- [ ] Input do formulário responsivo durante submissão
- [ ] `startTransition` wrapping as chamadas de API non-critical

**Estimativa:** 1.5h

---

### T010 – Substituir debounce manual por useDeferredValue em busca de alunos
**Tipo:** PARALLEL-GROUP-2
**Dependências:** none
**Arquivos:**
- modificar: `src/components/admin/StudentSearchInput.tsx` (ou equivalente)

**Descrição:** A busca de alunos usa `setTimeout` manual para debounce. `useDeferredValue` é a API nativa React 18+ para esse padrão, deferindo re-renders pesados sem bloquear o input.

**Critérios de Aceite:**
- [ ] `useDeferredValue(searchQuery)` usado para a query deferida
- [ ] Lista de alunos atualizada com valor diferido
- [ ] Input responsivo sem delay perceptível

**Estimativa:** 0.5h

---

## Resumo

| Task | Severidade | Esforço | Impacto |
|------|-----------|---------|---------|
| T001 – web-vitals | HIGH | 1h | Visibilidade de métricas |
| T002 – Keys em skeletons | HIGH | 1h | Reconciliação correta |
| T003 – Lazy Recharts /progress | MEDIUM | 1.5h | Bundle reduzido |
| T004 – Lazy CorglyCircle dashboard | MEDIUM | 0.5h | LCP dashboard |
| T005 – Lazy Stripe | HIGH | 1.5h | Bundle home/dashboard |
| T006 – Split AuthContext | MEDIUM | 2h | Re-renders globais |
| T007 – Bundle analyzer | HIGH | 0.5h | Observabilidade de bundle |
| T008 – modularizeImports | MEDIUM | 0.5h | Tree-shaking |
| T009 – useTransition em forms | MEDIUM | 1.5h | INP/responsividade |
| T010 – useDeferredValue na busca | MEDIUM | 0.5h | INP/responsividade |

**Total estimado:** ~11h
