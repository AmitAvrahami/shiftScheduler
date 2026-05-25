# POLISH-04 — Unified Page-Level Loading States

## Goal

Prevent UI flicker and incorrect default states before server data is loaded. Pages
currently render server-derived booleans that default to `false`, so on first paint
they show wrong defaults (e.g. `isLocked=false` → "open/unlocked" banner + enabled
action buttons) and then flip once the API responds. This task adds a page-level
loading/error layer and the `boolean | null` convention so `false` never means
"not loaded".

## Scope

- New reusable `PageDataBoundary` component (loading / error / ready) that composes
  the existing `PageLoader` and `ErrorState`.
- For every main page that fetches critical data: gate the server-data region with
  `PageDataBoundary` until all critical data is loaded; show a clear error state with
  retry when a required API call fails.
- Convert server-derived booleans that default to `false` to `boolean | null`,
  initialized to `null` (notably `isLocked` in `ConstraintPage` and
  `useAdminConstraints`).
- Do not render lock / publish / generate / edit / delete buttons until their required
  data is loaded.
- Keep UI RTL + Hebrew; no business-logic changes; no new libraries.

Pages in scope: ConstraintPage, AdminConstraintsPage (+ useAdminConstraints),
AdminWeeklyStaffingPage, SchedulesPage, UsersPage, AdminShiftDefinitionsPage,
AdminDashboardPage, ScheduleBoardPage.

## Out of Scope

- DashboardPage (employee) and LoginPage — no critical server data (DashboardPage is
  hardcoded mock; LoginPage is a form). RegisterPage (redirect-only) and HomePage
  (unrouted).
- Business-logic, DTO, API-shape, or CSP changes.
- Per-action button spinners — already shipped in POLISH-02.
- New libraries — `PageDataBoundary` reuses existing components only.

## Current Findings

- POLISH-02 shipped `LoadingSpinner`, `PageLoader`, `EmptyState`, `ErrorState`,
  `LoadingButton` (per-action layer) but no page-level boundary.
- `ConstraintPage`: `isLocked` defaults to `false`, no page loader → open-vs-locked
  banner + submit/clear buttons flash wrong state before load.
- `useAdminConstraints`: `isLocked` defaults to `false`, exposes no page-load flag;
  `weekStatus` already `string | null`. `error` is shared by load + save/toggle.
- `AdminWeeklyStaffingPage`: `scheduleStatus` already `Schedule['status'] | null`
  (reference pattern), but `loading` inits to `false` → empty-state/"אתחל משמרות"
  flash before the effect runs.
- `SchedulesPage`: load failure only fires a toast, leaving an empty grid.
- `UsersPage` + `AdminShiftDefinitionsPage`: already have `loading` + `PageLoader` +
  error string; just need the boundary swap for error+retry.
- `useAdminDashboard`: already returns `loading` (init true), `error`,
  `dashboard|null` — no boolean-default issue. Used by AdminDashboardPage (inline
  "טוען נתוני דאשבורד...") and ScheduleBoardPage (custom early-return blocks; header
  `actions` render during load).

## Implementation Plan

1. Create `frontend/src/components/ui/PageDataBoundary.tsx`.
2. ConstraintPage: add `loading` (init true), `isLocked: boolean | null` (init null),
   `loadData` callback for retry; wrap data region (banner + header actions + day
   cards) in `PageDataBoundary`.
3. AdminWeeklyStaffingPage: `loading` init → true; wrap region below week-nav in
   `PageDataBoundary`; remove redundant inline loading/error blocks.
4. SchedulesPage: add `loadError`, extract `loadSchedules`, wrap cards grid in
   `PageDataBoundary`.
5. UsersPage + AdminShiftDefinitionsPage: swap `PageLoader` → `PageDataBoundary` with
   error + retry.
6. useAdminConstraints: add `loading` (init true) + dedicated `loadError`; `isLocked`
   → `boolean | null`; return `loading`, `loadError`, `reload`. AdminConstraintsPage:
   conditionally render the lock badge/button block; wrap data region in
   `PageDataBoundary`.
7. AdminDashboardPage: wrap content inside `!weekIdError` in `PageDataBoundary`
   (`onRetry={refresh}`). ScheduleBoardPage: replace early-returns with
   `PageDataBoundary`; pass `actions` conditionally on `dashboard`.

## Files to Inspect

- frontend/src/components/ui/{PageLoader,ErrorState,LoadingSpinner}.tsx
- frontend/src/pages/{ConstraintPage,SchedulesPage,UsersPage,AdminShiftDefinitionsPage,AdminConstraintsPage,AdminDashboardPage,ScheduleBoardPage}.tsx
- frontend/src/pages/admin/AdminWeeklyStaffingPage.tsx
- frontend/src/hooks/useAdminConstraints.ts
- frontend/src/pages/admin/hooks/useAdminDashboard.ts

## Files to Change

- ADD: frontend/src/components/ui/PageDataBoundary.tsx
- frontend/src/pages/ConstraintPage.tsx
- frontend/src/pages/admin/AdminWeeklyStaffingPage.tsx
- frontend/src/pages/SchedulesPage.tsx
- frontend/src/pages/UsersPage.tsx
- frontend/src/pages/AdminShiftDefinitionsPage.tsx
- frontend/src/hooks/useAdminConstraints.ts
- frontend/src/pages/AdminConstraintsPage.tsx
- frontend/src/pages/AdminDashboardPage.tsx
- frontend/src/pages/ScheduleBoardPage.tsx

## Guardrails

- `false` must never mean "not loaded"; use `boolean | null` for server-derived flags.
- Do not render lock / publish / generate / edit / delete until required data is loaded.
- Wrap data regions only — never `MainLayout` or static chrome (page header, week-nav,
  filters, search). Server-dependent header `actions` render conditionally.
- Preserve all existing Hebrew copy, RTL, styling, and behavior.
- Keep load errors distinct from action errors where a hook already separates them.

## Validation Checklist

- [x] TypeScript compiles without errors (`cd frontend && npx tsc --noEmit`)
- [x] Prettier passes (`npm run format:check`)
- [x] ESLint passes (`npm run lint` — 0 errors; 6 pre-existing backend test unused-var warnings)
- [x] Build succeeds (`npm run build`)
- [x] Backend tests pass (`npm test --workspace=backend -- --runInBand` — 505/505)
- [x] UI behavior preserved; RTL/Hebrew intact

## Final Implementation Summary

Added `frontend/src/components/ui/PageDataBoundary.tsx` — a reusable loading/error/ready
gate composing the existing `PageLoader` and `ErrorState` (no new libraries). Applied it
to gate the server-data region of each main page, keeping static chrome (page header,
week-nav, filters/search) visible per the agreed UX.

Per-page changes:

- **ConstraintPage**: `loading` state (init true); `isLocked: boolean | null` (init null);
  `loadData` + `PageDataBoundary` over the banner/actions/day-cards region. Extracted the
  demo definitions to a module-level `MOCK_DEFINITIONS` const.
- **AdminWeeklyStaffingPage**: fixed `loading` init `false → true` (was flashing the empty
  state); wrapped the region below the week-nav in `PageDataBoundary`.
- **SchedulesPage**: added `loadError` + `loadSchedules`; cards grid wrapped in
  `PageDataBoundary` (load failure now shows error+retry instead of an empty grid).
- **UsersPage** / **AdminShiftDefinitionsPage**: swapped `PageLoader` for `PageDataBoundary`
  (adds error+retry); load functions now reset loading/error for retry.
- **useAdminConstraints**: added `loading` (init true) + dedicated `loadError`; `isLocked →
boolean | null`; save/lock-toggle refreshes are silent so the table stays visible; exposes
  `loading`, `loadError`, `reload`. **AdminConstraintsPage**: lock badge/button rendered only
  once loaded (`!loading && !loadError && isLocked !== null`); data region wrapped in boundary.
- **AdminDashboardPage**: content wrapped in `PageDataBoundary` (`onRetry=refresh`) so
  generate/publish actions in QuickActionsPanel don't render before the dashboard loads;
  refresh failures with data present surface inline.
- **ScheduleBoardPage**: replaced the two custom early-return blocks with `PageDataBoundary`;
  publish/generate header actions gated on `dashboard` (week-nav + staffing kept as chrome).

Note: the React Compiler lint (`preserve-manual-memoization`) rejected a `useCallback` for
ConstraintPage's loader because its `weekId` is recomputed each render (not `useState`); used
a plain `async function loadData()` + `[weekId]` effect instead. New effects use the repo's
existing `eslint-disable react-hooks/set-state-in-effect` pattern.

Out of scope (unchanged): DashboardPage and LoginPage — no critical server data.
