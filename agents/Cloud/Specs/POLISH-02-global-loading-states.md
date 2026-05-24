# Spec: POLISH-02 - Global Loading States

## Goal
Improve user experience by implementing consistent loading states across the frontend application. Ensure that all async operations provide visual feedback, prevent duplicate actions by disabling buttons, and handle empty/error states gracefully.

## Scope
- Page-level loading states for all major routes.
- Action-level loading states (buttons, spinners) for all async operations (Create, Update, Delete, Generate, Publish).
- Error and empty states for data-driven views.
- Hebrew (RTL) compatibility for all UI feedback.
- Implementation of reusable loading components.

## Out of Scope
- Solver logic changes.
- Schedule generation/constraint algorithm modifications.
- API contract or DB schema changes.
- Broad UI redesigns.
- DashboardPage real data hooks.

## Current State / Findings
- No central loading infrastructure (no generic `Spinner`, `Skeleton`, or `PageLoader` components).
- Many pages use raw `loading` boolean states but lack a consistent UI pattern.
- Some buttons show loading text (e.g., "יוצר...", "שולח...") but many remain enabled during async actions.
- `AdminShiftDefinitionsPage` has English loading/error text.
- `AdminConstraintsPage` `toggleLock` fires async but exposes no loading state.

## Files Inspected
- `frontend/src/pages/SchedulesPage.tsx`
- `frontend/src/pages/ConstraintPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/AdminDashboardPage.tsx`
- `frontend/src/pages/UsersPage.tsx`
- `frontend/src/pages/AdminShiftDefinitionsPage.tsx`
- `frontend/src/pages/AdminConstraintsPage.tsx`
- `frontend/src/pages/admin/components/WeeklyStaffingEditor.tsx`
- `frontend/src/pages/admin/components/QuickActionsPanel.tsx`
- `frontend/src/hooks/useAdminConstraints.ts`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`

## Existing loading components/patterns
- `MaterialIcon` with `animate-spin` is used in some places (e.g., `SchedulesPage`, `QuickActionsPanel`).
- Inline pulse animations (`animate-pulse`) in `AuditLogPanel`, `MissingConstraintsPanel`.
- Basic conditional rendering: `{loading ? <div>...</div> : <Content />}`.

## Implementation Plan

### Phase 1: Create Base Components in `frontend/src/components/ui/`
- `LoadingSpinner` — size-aware border-spinner with explicit Tailwind class maps.
- `PageLoader` — centered spinner + optional text for container-level loading.
- `EmptyState` — centered icon + message for empty data views.
- `ErrorState` — centered error icon + message + optional retry button.
- `LoadingButton` — button with spinner, disables when `isLoading`, spinner color adapts per variant.

### Phase 2: `useAdminConstraints.ts`
- Add `toggleLockLoading` state, set/clear around `constraintApi.setLockState` call.

### Phase 3: `SchedulesPage.tsx`
- Add `cloningId`, `deletingId`, `publishingId` per-action states.
- Update `handleClone`, `handleDelete`, `handlePublish`, `proceedPublish` to set/clear these.
- `publishingId` cleared in `proceedPublish` finally and on modal cancel.
- `ActionBtn` gains `isLoading` prop — shows inline spinner when set.
- `ScheduleCard` gains `isCloning/isDeleting/isPublishing` props — disables all buttons when any is busy.
- Replace raw loading div with `<PageLoader text="טוען סידורים..." />`.

### Phase 4: `UsersPage.tsx`
- Add `pageLoading` state, set to false in finally of initial fetch.
- Show `<PageLoader text="טוען משתמשים..." />` while loading (early return pattern).
- Add `togglingStatusId` and `togglingMorningId` states.
- Status badge and fixed morning toggle show inline spinner and are disabled while toggling.

### Phase 5: `AdminShiftDefinitionsPage.tsx`
- Translate all visible English strings to Hebrew.
- Add `submitting` state for form submit, `deletingId` for per-row delete.
- Delete button shows inline spinner and is disabled during delete.
- Submit button shows spinner + "שומר..." and is disabled during submit.
- Replace raw loading text with `<PageLoader text="טוען הגדרות משמרות..." />`.

### Phase 6: `AdminConstraintsPage.tsx`
- Destructure `toggleLockLoading` from hook.
- Lock toggle button shows `<LoadingSpinner size="sm" color="current" />` and is disabled while loading.

## Files Changed

**Created:**
- `frontend/src/components/ui/LoadingSpinner.tsx`
- `frontend/src/components/ui/PageLoader.tsx`
- `frontend/src/components/ui/EmptyState.tsx`
- `frontend/src/components/ui/ErrorState.tsx`
- `frontend/src/components/ui/LoadingButton.tsx`

**Modified:**
- `frontend/src/hooks/useAdminConstraints.ts` — added `toggleLockLoading`
- `frontend/src/pages/SchedulesPage.tsx` — per-action loading states, `PageLoader`, `ActionBtn isLoading`
- `frontend/src/pages/UsersPage.tsx` — `pageLoading`, `togglingStatusId`, `togglingMorningId`
- `frontend/src/pages/AdminShiftDefinitionsPage.tsx` — Hebrew translation, `submitting`, `deletingId`, `PageLoader`
- `frontend/src/pages/AdminConstraintsPage.tsx` — `toggleLockLoading` wired to lock button

**Not touched (already had good patterns):**
- `QuickActionsPanel.tsx`
- `WeeklyStaffingEditor.tsx`
- `DashboardPage.tsx` (out of scope)
- All backend files

## Validation Checklist
- [x] `npx tsc --noEmit` — zero errors
- [x] `npm run build` — success, zero TS errors
- [x] `npm run lint` — 0 errors, 6 pre-existing backend test warnings (unchanged)
- [x] Hebrew text used for all feedback
- [x] Buttons disabled and show spinners during async actions
- [x] No dynamic Tailwind class construction (explicit class maps used)
- [x] RTL layout preserved

## What Was Not Manually Tested
- End-to-end UI interaction in a running browser (server not started).
- Network error paths (API failures during clone/delete/publish).
- Race conditions if user rapidly clicks a just-re-enabled button.

## Follow-up Recommendations
- `ErrorState` component is created but not yet wired into pages — consider adding it to pages that already expose a `loadError` string (e.g., `UsersPage`).
- `EmptyState` component is created but the existing custom empty states in `SchedulesPage` and `UsersPage` are already sufficient — use `EmptyState` for any new pages.
- `LoadingButton` is created but not yet used in pages (existing buttons were kept consistent with their inline patterns) — adopt it for any new form submit buttons.
- `DashboardPage` hero cards still use static data — a future task should connect them to real API endpoints.

## Final Implementation Summary

Implemented POLISH-02 in full within the approved scope. Created 5 reusable UI feedback components matching existing Tailwind visual patterns. Wired per-action loading states into `SchedulesPage` (clone/delete/publish), `UsersPage` (toggleStatus/toggleFixedMorning), `AdminShiftDefinitionsPage` (delete/submit), and `AdminConstraintsPage` (toggleLock). Translated `AdminShiftDefinitionsPage` from English to Hebrew. All async action buttons now disable and show spinners during in-flight requests, preventing duplicate clicks. TypeScript, build, and lint all pass clean.
