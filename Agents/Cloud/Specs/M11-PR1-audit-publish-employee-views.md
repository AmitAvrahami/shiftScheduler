# M11-PR1 — Audit: Publish Flow + Employee Schedule Views

## Goal

Produce a definitive audit of the current Publish flow (manager side) and Employee schedule surfaces (employee dashboard, personal shifts view, full published schedule view) so that Milestone 11 can be broken into small, focused PRs. Establish the canonical Hebrew strings, lock the PR sequence, and identify one security gap that must be closed in PR2.

This task is **investigation only**. No application code is modified. The deliverable is this spec plus the sibling spec file `M11-PR2-publish-hardening.md`.

## Scope

- Read-only inspection of the current codebase covering:
  - Manager publish UI (button, dialog, hook, API client).
  - Backend publish endpoint, controller, service, state machine, audit log, notifications.
  - Employee dashboard, login redirect, route guards.
  - Employee schedule API behavior for both `GET /schedules` and `GET /assignments`.
  - `ScheduleBoard` read-only support.
  - Existing publish-related tests.
- Production of a PR breakdown for M11.
- Capture of canonical Hebrew strings to be reused across all M11 PRs.
- Identification of the **draft-assignment leak** in `assignmentController.getAssignments`.

## Out of Scope

- Any application code change (frontend or backend).
- M10 functionality.
- Issue #84 (draft edit mode) and Issue #16 (concurrency).
- Implementation of employee dashboard real data, employee full schedule view, or any UX redesign.
- Persisting `approvedWarnings` to the audit log (deferred beyond M11).

## Current Findings

### Manager publish flow (works, minor gaps)

- **Publish button** lives in `frontend/src/pages/ScheduleBoardPage.tsx:346-357`, gated on `isDraft`.
- **Warnings dialog**: `frontend/src/pages/admin/components/PublishWarningsDialog.tsx`. Triggered from `handlePublish()` in `ScheduleBoardPage.tsx:115-143` based on `detectPublishWarnings()` (`frontend/src/utils/partialAvailabilityWarnings.ts`). Dialog Hebrew copy already correct.
- **Hook**: `frontend/src/pages/admin/hooks/useAdminDashboard.ts:136-157` — `publishSchedule()` has a `scheduleId` guard returning Hebrew error `הסידור לא נמצא לשבוע זה`, sets `actionLoading.publishing`, calls `scheduleApi.update(scheduleId, 'published', approvedWarnings)`, refreshes on success, sets generic `שגיאה לא צפויה` on failure.
- **API client**: `frontend/src/lib/api.ts:337-346` — `PATCH /schedules/:id` with `{ status, approvedWarnings }`.
- **Backend controller**: `backend/src/controllers/scheduleController.ts:191-280` (`updateSchedule`). Validates state-machine transition from a `validTransitions` table (`draft → published` allowed). On publish: sets `publishedAt`, `publishedBy`, fans out `schedule_published` notifications to all active employees with Hebrew `title: 'לוח משמרות פורסם'` and `body: לוח המשמרות לשבוע {weekId} פורסם`, upserts `SystemSettings.workflow_state = 'schedule_published'`, writes `AuditLog` entry with `action: 'schedule_updated'`, `before`, `after`. Protected by `verifyToken` + `isManager` at `backend/src/routes/schedule.routes.ts:26`.
- **Schedule model**: `backend/src/models/WeeklySchedule.ts` — `status` enum `['open','locked','generating','draft','published','archived']`, plus `publishedAt`, `publishedBy`.
- **Tests**: `backend/src/__tests__/schedule.test.ts:263-302, 507-520` cover employee 403, invalid transitions 422, publish notification fan-out, audit log creation, draft→published regression.
- **Hebrew success toast**: present in `frontend/src/pages/SchedulesPage.tsx:610-612` (`הסידור פורסם בהצלחה` / `שגיאה בפרסום הסידור`), but **missing** from `ScheduleBoardPage` where the publish button actually lives.
- **Generic error in hook**: `useAdminDashboard.publishSchedule` catches all errors as the generic `שגיאה לא צפויה` rather than a publish-specific message.
- **`approvedWarnings`**: serialized over the wire and validated by Zod but not persisted or audited. Deferred.

### Employee dashboard (mostly missing)

- Login redirect: `frontend/src/pages/LoginPage.tsx:14-22` sends employees to `/dashboard`, managers/admins to `/admin`.
- `frontend/src/pages/DashboardPage.tsx` is **fully mocked** — no API calls, hardcoded `WEEKLY_SCHEDULE` and `HeroShiftCard` content.
- Nav item `/my-shifts` exists in `frontend/src/components/layout/MainLayout.tsx:16` but the route is **not** registered in `App.tsx` → 404.
- No full-schedule view exists for employees.

### Backend filters

- `GET /schedules` → `backend/src/controllers/scheduleController.ts:75-87` correctly restricts non-managers to `status:'published'`. ✅
- `GET /assignments` → `backend/src/controllers/assignmentController.ts:26-47` restricts non-managers to `userId: req.user._id` only. **It does NOT check the parent schedule's status.** A non-manager calling `GET /assignments?scheduleId=<draftScheduleId>` will receive their own assignments from a draft schedule. **This is a leak — Gemini finding. Must be closed in PR2.**

### ScheduleBoard read-only

- `frontend/src/pages/admin/components/ScheduleBoard.tsx:39-84` accepts a `readOnly` prop that nullifies `onShiftClick`, `onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment` and disables drag sensors. Ready for employee reuse in PR4 — no fork required.

### Frontend route guards

- `frontend/src/components/ProtectedRoute.tsx` correctly redirects non-managers away from `/admin`, `/schedules`, `/schedules/:weekId`. Employees can land on `/dashboard` and `/constraints`. ✅

### Suspected useEffect / stale-closure bug

- No employee schedule page exists yet → no bug to fix today.
- Forward-looking concern: when PR3/PR4 lands, prefer inline fetch inside `useEffect` over `loadData()` indirection. If indirection is needed, wrap `loadData` in `useCallback` with honest deps; do not use `eslint-disable-next-line react-hooks/exhaustive-deps`. Reference precedent: `frontend/src/pages/ConstraintPage.tsx:140-145` (currently safe, but pattern is fragile).

## Implementation Plan

This is an audit PR — there is no implementation. The plan is to produce decisions and capture them.

1. Inspect all files listed in **Files to Inspect**. ✅ (already done)
2. Capture canonical Hebrew strings:
   - `הסידור פורסם בהצלחה` — publish success toast
   - `שגיאה בפרסום הסידור` — publish error toast
   - `צפה בסידור המלא` — link/button to full published schedule (PR4)
   - `הסידור טרם פורסם` — empty state when no published schedule exists (PR3/PR4)
   - `אין משמרות משובצות לשבוע זה` — empty state when employee has no shifts in the published week (PR3/PR4)
3. Lock the §4 decision: relax `getAssignments` to return everyone's assignments when the parent schedule is `published`. Path A from the audit plan.
4. Adopt Gemini's finding: in the same `getAssignments`, when the caller is not a manager and the parent schedule is non-published, return 403 and an empty list. This applies whether the employee is querying for their own data or another user's.
5. Define M11 PR sequence:
   - PR1 (this) — audit + plan.
   - PR2 — publish hardening **+ assignment draft-leak guard**. See sibling spec `M11-PR2-publish-hardening.md`.
   - PR3 — employee dashboard real data.
   - PR4 — employee full published schedule view.
   - PR5 — loading/refresh/useEffect hygiene + empty states.
   - PR6 — access-control & QA pass.
6. Record this audit. Stop. Wait for approval before starting PR2.

## Files to Inspect

- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`
- `frontend/src/pages/admin/components/PublishWarningsDialog.tsx`
- `frontend/src/pages/admin/components/ScheduleBoard.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/SchedulesPage.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/utils/partialAvailabilityWarnings.ts`
- `backend/src/routes/schedule.routes.ts`
- `backend/src/controllers/scheduleController.ts`
- `backend/src/controllers/assignmentController.ts`
- `backend/src/models/WeeklySchedule.ts`
- `backend/src/__tests__/schedule.test.ts`

## Files to Change

None — this is an audit PR.

## Guardrails

- No application code changes in PR1.
- Use **only** the canonical Hebrew strings listed above. Do not paraphrase.
- Do not touch M10 functionality.
- Do not start Issue #84 or Issue #16.
- Reuse `ScheduleBoard readOnly` in PR4; do not fork it.
- Use local-date helpers (`toDateKey`) — never `toISOString().split('T')[0]` — when adding date logic in PR3/PR4 (see project memory: timezone bug).
- PR2 must NOT bundle race-condition fixes unless directly required to fix the assignment leak.
- The Gemini draft-leak finding is the only security change folded into PR2; do not expand scope.

## Validation Checklist

- [x] Manager publish flow mapped end-to-end (UI → hook → API → controller → audit log → tests).
- [x] Employee dashboard state characterized (fully mocked).
- [x] Employee full-schedule view confirmed absent.
- [x] Backend filters reviewed: `GET /schedules` correct, `GET /assignments` leaks for non-published schedules.
- [x] Canonical Hebrew strings recorded.
- [x] Read-only `ScheduleBoard` confirmed reusable.
- [x] PR sequence defined.
- [x] Sibling spec for PR2 written.

## Final Implementation Summary

Audit complete. Key outcomes:

- The publish flow is functionally correct end-to-end; only minor UX gaps remain (no success toast on `ScheduleBoardPage`, generic error message in `useAdminDashboard.publishSchedule`).
- Employees today see **no real data** — `DashboardPage` is fully mocked and `/my-shifts` is a dead nav link.
- **Security gap identified (Gemini finding):** `assignmentController.getAssignments` filters non-managers by `userId` but never checks the parent `WeeklySchedule.status`. Non-managers can fetch their own assignments from a draft schedule via `GET /assignments?scheduleId=<draftId>`. This will be closed in PR2.
- PR sequence locked: PR2 = publish hardening + assignment draft-leak guard. PR3 = employee dashboard real data. PR4 = employee full published schedule view (relaxes `getAssignments` to return everyone for `published` schedules). PR5 = loading hygiene + empty states. PR6 = access-control QA.
- Canonical Hebrew strings recorded and to be reused verbatim.
- Sibling spec `M11-PR2-publish-hardening.md` created and ready to execute.
