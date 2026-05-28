# M11-PR2 — Publish Hardening + Assignment Draft-Leak Guard

## Goal

Close the employee assignment draft leak identified in M11-PR1 and harden the manager publish UX with the canonical Hebrew success/error strings before building employee-facing schedule views.

## Scope

- Backend:
  - Guard `GET /assignments?scheduleId=<id>` so non-managers cannot read assignments from non-published schedules.
  - Keep manager/admin assignment access unchanged.
  - Add regression tests proving employees cannot fetch their own draft assignments.
- Frontend:
  - Show the canonical publish success toast from `ScheduleBoardPage`.
  - Use the canonical publish error message for publish failures.
  - Preserve the existing publish warning dialog and `approvedWarnings` request payload.

## Out of Scope

- Employee dashboard real data.
- Employee full published schedule view.
- Returning every employee's assignments for published full-schedule viewing; that belongs to PR4.
- Race-condition or concurrency fixes.
- Persisting `approvedWarnings` to the audit log.
- Any M10 functionality.
- Issue #84 draft edit mode and Issue #16 concurrency.

## Current Findings

- `backend/src/controllers/assignmentController.ts:26-47` filters non-managers by `userId` only. If an employee calls `GET /assignments?scheduleId=<draftScheduleId>`, they receive their own draft assignments.
- `backend/src/routes/assignment.routes.ts:11` exposes `GET /assignments` to any authenticated user, so the guard must live in `getAssignments`.
- `backend/src/controllers/scheduleController.ts:75-87` already restricts non-managers to published schedules for `GET /schedules`.
- `backend/src/controllers/scheduleController.ts:191-280` already validates state transitions, sets `publishedAt`/`publishedBy`, writes notifications, updates workflow state, and writes an audit log on publish.
- `backend/src/__tests__/assignment.test.ts` has list, create, read, update, and delete coverage, but no schedule-status coverage for employee list access.
- `frontend/src/pages/ScheduleBoardPage.tsx:113-143` runs publish warning detection and calls `actions.publishSchedule()`, but does not show a success toast.
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts:136-157` catches publish failures as generic `שגיאה לא צפויה`.
- `frontend/src/pages/SchedulesPage.tsx:610-612` already uses the canonical publish strings:
  - `הסידור פורסם בהצלחה`
  - `שגיאה בפרסום הסידור`

## Implementation Plan

1. Add backend regression tests in `backend/src/__tests__/assignment.test.ts`:
   - Employee can still fetch their own assignment from a published schedule with `GET /api/v1/assignments?scheduleId=<publishedId>`.
   - Employee gets `403` for `GET /api/v1/assignments?scheduleId=<draftId>` even when the assignment belongs to them.
   - Manager can still fetch assignments from a draft schedule.
2. Run the focused assignment tests and confirm the new draft-leak test fails before implementation:
   - `npm test -- --runInBand backend/src/__tests__/assignment.test.ts`
3. Modify `backend/src/controllers/assignmentController.ts`:
   - Import `WeeklySchedule`.
   - In `getAssignments`, when `scheduleId` is present and the caller is not manager/admin, load the parent schedule.
   - If the parent schedule is missing, return `404` using `AppError('Schedule not found', 404)`.
   - If the parent schedule exists and `status !== 'published'`, return `403` using `AppError('Forbidden — schedule is not published', 403)`.
   - Leave the non-manager `userId: req.user!._id` restriction in place for PR2.
4. Run the focused assignment tests again and confirm they pass.
5. Update `frontend/src/pages/admin/hooks/useAdminDashboard.ts`:
   - In `publishSchedule`, set publish failures to `שגיאה בפרסום הסידור`.
   - Return a boolean success result from `publishSchedule`: `true` after `refresh()`, `false` on missing schedule or catch.
   - Preserve `actionLoading.publishing`, `refreshing`, and `approvedWarnings`.
6. Update `frontend/src/pages/ScheduleBoardPage.tsx`:
   - Import/use the existing toast mechanism if one is already present on the page; otherwise add the same local toast pattern used by nearby schedule-management pages.
   - In both publish paths (`handlePublish` after no warnings, `handleConfirmPublish` after approved warnings), show `הסידור פורסם בהצלחה` only when `actions.publishSchedule(...)` returns `true`.
   - Do not duplicate success toasts when the warnings dialog path is used.
   - Keep the warning-detection error string `שגיאה בבדיקת אזהרות פרסום` unchanged.
7. Run frontend type/build validation:
   - `npm test -- --runInBand backend/src/__tests__/assignment.test.ts`
   - `npm run build --workspace frontend` if workspace scripts support it, otherwise `cd frontend && npm run build`.
   - If lint/typecheck scripts exist, run the focused available command for touched files or the package-level command.

## Files to Inspect

- `backend/src/controllers/assignmentController.ts`
- `backend/src/controllers/scheduleController.ts`
- `backend/src/routes/assignment.routes.ts`
- `backend/src/models/WeeklySchedule.ts`
- `backend/src/models/Assignment.ts`
- `backend/src/__tests__/assignment.test.ts`
- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`
- `frontend/src/pages/SchedulesPage.tsx`
- `frontend/src/lib/api.ts`

## Files to Change

- `backend/src/controllers/assignmentController.ts`
- `backend/src/__tests__/assignment.test.ts`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`
- `frontend/src/pages/ScheduleBoardPage.tsx`

## Guardrails

- Use only these publish toast strings:
  - Success: `הסידור פורסם בהצלחה`
  - Error: `שגיאה בפרסום הסידור`
- Do not change the publish state machine.
- Do not change manager/admin assignment visibility.
- Do not relax employee assignment visibility for published schedules in PR2; PR4 owns full-schedule employee visibility.
- Do not persist `approvedWarnings`.
- Do not add broad access-control changes beyond the assignment draft-leak guard.
- Do not use `toISOString().split('T')[0]` for any date logic.

## Validation Checklist

- [ ] Focused backend assignment tests fail before the guard is implemented.
- [ ] Focused backend assignment tests pass after the guard is implemented.
- [ ] Employee `GET /assignments?scheduleId=<draftId>` returns `403`.
- [ ] Employee `GET /assignments?scheduleId=<publishedId>` still returns only their own assignments.
- [ ] Manager/admin assignment access is unchanged.
- [ ] Publish success toast appears on `ScheduleBoardPage` after successful publish.
- [ ] Publish failure uses `שגיאה בפרסום הסידור`.
- [ ] Publish warning dialog behavior is unchanged.
- [ ] TypeScript/build validation passes for touched packages.

## Final Implementation Summary

Pending implementation.
