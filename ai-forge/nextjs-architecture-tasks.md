<metadata>
source: /nextjs:architecture .claude/projects/corgly.json
repo: output/workspace/corgly
date: 2026-03-22
estimated-hours: 4
complexity: medium
</metadata>

<overview>
6 architecture issues resolved: layout wrapper duplication (32 occurrences), fetch duplication (5 raw fetch calls),
subscription logic inline in component, missing shared components, missing shared hooks, and inline date formatter duplication.
</overview>

<task-list>

### T001 — Create `PageWrapper` shared component
**Status:** ✅ COMPLETED
**File created:** `src/components/shared/page-wrapper.tsx`
**Exported from:** `src/components/shared/index.ts`
**Pattern:** `cn('px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto', className)`

---

### T002 — Create `AuthPageWrapper` shared component
**Status:** ✅ COMPLETED
**File created:** `src/components/shared/auth-page-wrapper.tsx`
**Exported from:** `src/components/shared/index.ts`
**Pattern:** `cn('min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4', className)`

---

### T003 — Apply `PageWrapper` to all admin/student pages
**Status:** ✅ COMPLETED
**Pages updated (20):**
- `(admin)/admin/dashboard/page.tsx`
- `(admin)/admin/credits/page.tsx`
- `(admin)/admin/sessions/page.tsx`
- `(admin)/admin/reports/page.tsx`
- `(admin)/admin/schedule/page.tsx`
- `(admin)/admin/content/page.tsx`
- `(admin)/admin/students/page.tsx`
- `(admin)/admin/students/[id]/page.tsx` — `className="max-w-4xl"`
- `(admin)/admin/sessions/[id]/page.tsx` — `className="max-w-3xl"`
- `(admin)/admin/feedback/[sessionId]/page.tsx` — `className="max-w-2xl"`
- `(admin)/admin/feedback/[sessionId]/loading.tsx`
- `(admin)/admin/feedback/[sessionId]/error.tsx`
- `(student)/progress/page.tsx`
- `(student)/schedule/page.tsx` — `className="max-w-5xl"`
- `(student)/credits/page.tsx` — `className="max-w-4xl"`
- `(student)/account/page.tsx` — `className="max-w-2xl"`
- `(student)/dashboard/page.tsx` — `className="max-w-5xl"`
- `(student)/history/page.tsx` — `className="max-w-4xl"`
- `(student)/account/billing/page.tsx` — `className="max-w-3xl"`
- `(student)/session/[id]/feedback/page.tsx` — `className="max-w-lg"`

---

### T004 — Apply `AuthPageWrapper` to all auth pages
**Status:** ✅ COMPLETED
**Pages updated (7):**
- `(public)/auth/login/page.tsx`
- `(public)/auth/register/page.tsx`
- `(public)/auth/forgot-password/page.tsx`
- `(public)/auth/reset-password/page.tsx` (3 conditional return branches)
- `(public)/auth/confirm-email/page.tsx` (4 conditional return branches)
- `(public)/auth/resend-confirmation/page.tsx` (2 conditional return branches)
- `(public)/auth/cancel-deletion/page.tsx` (4 conditional return branches)

---

### T005 — Replace `fetch()` with `apiClient` in FeedbackHistory
**Status:** ✅ COMPLETED
**File:** `src/components/progress/FeedbackHistory.tsx`
**Change:** `fetch('/api/v1/feedback/history?...')` → `apiClient.get<{ data: HistoryData }>('/api/v1/feedback/history', { params: {...} })`

---

### T006 — Replace `fetch()` with `apiClient` in SessionPageClient
**Status:** ✅ COMPLETED
**File:** `src/components/session/SessionPageClient.tsx`
**Changes:** 3 PATCH calls migrated from raw `fetch()` to `apiClient.patch()`

---

### T007 — Create `useSubscription` hook
**Status:** ✅ COMPLETED
**File created:** `src/hooks/useSubscription.ts`
**Exported from:** `src/hooks/index.ts`
**Exports:** `Subscription` type + `useSubscription()` hook with `{ subscription, isLoading, error, isCancelling, isUpdating, refetch, cancel, updateFrequency }`

---

### T008 — Refactor `subscription-manager.tsx` to use hook
**Status:** ✅ COMPLETED
**File:** `src/components/billing/subscription-manager.tsx`
**Change:** Removed ~80 lines of inline data-fetching/mutation logic; replaced with `useSubscription()` hook

---

### T009 — Centralize date formatters
**Status:** ✅ COMPLETED
**File created:** `src/lib/format-datetime.ts`
**Exports:** `formatDatePtBR()`, `formatDateTimePtBR()`
**Files updated:** `admin/students/[id]/page.tsx`, `admin/feedback/[sessionId]/page.tsx`

</task-list>

<validation-strategy>
- `grep -rn "min-h-\[calc(100vh-64px)\]" src/` → 0 results expected
- `grep -rn "px-4 py-6 md:px-6 md:py-8" src/` → 0 results expected
- `grep -rn "await fetch(" src/components/` → 0 results expected
- Build: `npm run build` must pass without errors
</validation-strategy>

<acceptance-criteria>
- [x] All layout wrapper strings eliminated
- [x] All auth wrapper strings eliminated
- [x] All raw `fetch()` calls in components migrated to `apiClient`
- [x] Subscription logic in dedicated hook
- [x] Shared components in `src/components/shared/`
- [x] Shared hooks in `src/hooks/`
- [x] Date utilities in `src/lib/`
- [x] No regressions introduced (same behavior, cleaner structure)
</acceptance-criteria>
