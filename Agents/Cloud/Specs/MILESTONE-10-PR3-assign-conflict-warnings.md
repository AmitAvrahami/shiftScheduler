# MILESTONE-10-PR3 — Assign-time Conflict / Availability Warnings

## Goal

When a manager manually assigns an employee from the Schedule Board picker, surface advisory warnings before the assignment is persisted: the employee is already on another shift the same day, or the employee submitted a constraint that conflicts with the target shift (fully unavailable / partial availability with insufficient overlap). The manager can cancel or proceed anyway. Warnings are advisory only — the backend still accepts the assignment.

## Scope

- Pre-fetch active shift definitions and the week's constraints on `ScheduleBoardPage` mount; reuse the data in both the existing publish-warnings path and the new assign-warnings path.
- Add a pure helper `detectAssignmentConflicts` that produces an `AssignmentWarning[]` from the dashboard data + constraints + shift definitions.
- Add a new presentation-only `AssignmentWarningsDialog` (Hebrew RTL, modeled visually on `PublishWarningsDialog`) with "ביטול" / "שבץ בכל זאת" actions.
- Intercept `ShiftAssignmentModal`'s `onConfirm`: if `detectAssignmentConflicts` returns warnings, show the dialog; otherwise call `actions.assignEmployee` immediately (parity with PR 2).
- Remove ("הסר") flow is unchanged.

## Out of Scope

- Backend changes (no API, no controller, no service, no schema).
- Drag and drop.
- Server-side conflict enforcement / hard blocks on assign.
- Quality-score recalculation after manual edits.
- Undo.
- Time-overlap based double-booking analysis (we only flag _same date_ on the advisory).

## Current Findings

- `AdminDashboardShift.day` (`frontend/src/pages/admin/types.ts:21`) is a date string that may be `YYYY-MM-DD` or full ISO. `normalizeConstraintDate` (`frontend/src/utils/weekUtils.ts:126`) normalizes both forms; `detectPublishWarnings` already relies on this for date matching.
- `AdminDashboardAssignment` carries only `shiftId` and `employeeId` — date is derived via the shift lookup.
- `AdminDashboardDTO` does not include constraints; the publish path already fetches them on demand via `constraintApi.getAllConstraints(weekId)` and `shiftDefinitionApi.getActive()`.
- `ConstraintEntry` (`frontend/src/types/constraint.ts:19`) has `date`, `definitionId`, `canWork`, `availabilityType`, `startTime`, `endTime`.
- `classifyPartial` (`frontend/src/utils/availabilityPreview.ts:84`) returns `'forbidden' | 'available' | 'partial_warning'`. `overlapWithShift` computes overlap minutes.
- `ShiftAssignmentModal` already filters out employees already on the same shift; we still defensively skip the target shift when looking up same-day assignments.
- `PublishWarningsDialog` (`frontend/src/pages/admin/components/PublishWarningsDialog.tsx`) is publish-specific in copy/badges, so we add a parallel `AssignmentWarningsDialog` rather than generalizing it.

## Implementation Plan

1. Create `frontend/src/utils/assignmentConflicts.ts`:
   - Export `AssignmentWarningKind = 'already_assigned_same_day' | 'unavailable_constraint' | 'partial_availability'`.
   - Export `AssignmentWarning { kind, title, explanation, shiftName?, otherShiftName? }`.
   - Export `detectAssignmentConflicts({ targetShift, candidateEmployeeId, employees, shifts, assignments, constraints, shiftDefinitions })`:
     - Same-day check: for each assignment of the candidate where the joined shift is _not_ the target shift, if `normalizeConstraintDate(joinedShift.day) === normalizeConstraintDate(targetShift.day)`, push one `already_assigned_same_day` warning naming the other shift (definition name + Hebrew day label).
     - Constraint check: find the candidate's `Constraint` (handle `userId: string | { _id } | null`), then the matching entry by `(normalizeConstraintDate(entry.date), entry.definitionId === targetShift.definitionId)`.
       - If `availabilityType === 'unavailable'` or `canWork === false`, push `unavailable_constraint`.
       - Else if `availabilityType === 'partial'` and times exist, run `classifyPartial`; push `partial_availability` if it returns `'partial_warning'` (use `overlapWithShift` for the overlap minutes string).
     - All Hebrew strings written in normal logical order. No reversed text.
2. Create `frontend/src/pages/admin/components/AssignmentWarningsDialog.tsx`:
   - Props: `{ open, warnings: AssignmentWarning[], onCancel, onConfirm }`.
   - Visual: same backdrop / card layout as `PublishWarningsDialog`. Title: "אזהרות שיבוץ"; subtitle one Hebrew sentence; per-warning badge derived from `warning.title`; buttons "ביטול" / "שבץ בכל זאת".
3. Modify `frontend/src/pages/ScheduleBoardPage.tsx`:
   - Add `useEffect` that, when `weekId` changes, fetches constraints + active definitions in parallel and stores them in `useState` (`constraints: Constraint[]`, `shiftDefinitions: ShiftDefinition[]`). Silently fall back to `[]` on error.
   - Refactor `handlePublish` to use the prefetched data (still keep a try/catch around `detectPublishWarnings`).
   - Add `pendingAssignment: { shiftId, userId, warnings } | null` state.
   - In `<ShiftAssignmentModal onConfirm>`: compute warnings via `detectAssignmentConflicts`. If empty, close the picker and call `actions.assignEmployee(shiftId, userId)`. Else close the picker and set `pendingAssignment`.
   - Render `<AssignmentWarningsDialog open={pendingAssignment !== null} warnings={pendingAssignment?.warnings ?? []} onCancel={...} onConfirm={...}>`. On confirm: capture `{shiftId, userId}`, clear state, call `actions.assignEmployee`. On cancel: clear state only.

## Files to Inspect

- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/components/ShiftAssignmentModal.tsx`
- `frontend/src/pages/admin/components/PublishWarningsDialog.tsx`
- `frontend/src/pages/admin/types.ts`
- `frontend/src/types/constraint.ts`
- `frontend/src/utils/partialAvailabilityWarnings.ts`
- `frontend/src/utils/availabilityPreview.ts`
- `frontend/src/utils/weekUtils.ts`
- `frontend/src/pages/admin/utils/scheduleBoardUtils.ts`

## Files to Change

- `frontend/src/utils/assignmentConflicts.ts` (new)
- `frontend/src/pages/admin/components/AssignmentWarningsDialog.tsx` (new)
- `frontend/src/pages/ScheduleBoardPage.tsx` (modify)
- `Agents/Cloud/Specs/MILESTONE-10-PR3-assign-conflict-warnings.md` (new, this file)

## Guardrails

- Do not change backend code, routes, controllers, schemas, or services.
- Do not block or hard-fail the assignment — warnings are advisory; "שבץ בכל זאת" must persist via the existing PR 2 flow.
- Do not modify `useAdminDashboard`, `ShiftAssignmentModal`, `ShiftCell`, `ScheduleBoard`, or `api.ts`.
- Do not introduce drag-and-drop, Undo, or quality-score recalculation.
- All Hebrew strings written in normal logical order (e.g., `שבץ בכל זאת`, `אילוץ אי־זמינות`). Never reversed.
- Reuse `normalizeConstraintDate`, `classifyPartial`, `overlapWithShift`, `getDayLabel`, `getShiftTypeLabel`. Do not duplicate.

## Validation Checklist

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format` / `format:check` passes
- [ ] `npm run build` passes
- [ ] Backend untouched → no backend test run required
- [ ] Manual: assigning an employee already on another shift the same day shows "כבר משובץ באותו יום" warning; cancel does nothing, "שבץ בכל זאת" persists.
- [ ] Manual: assigning an employee with `canWork=false` for that shift shows "אילוץ אי־זמינות" warning; "שבץ בכל זאת" persists.
- [ ] Manual: assigning an employee with a partial-availability constraint that classifies as `partial_warning` shows "זמינות חלקית" warning.
- [ ] Manual: no-warning assignments flow straight through (parity with PR 2).
- [ ] Manual: "הסר" still works without any new prompt.

## Final Implementation Summary

Implemented exactly as planned. Three files added, one modified:

- `frontend/src/utils/assignmentConflicts.ts` — pure `detectAssignmentConflicts` helper returning `AssignmentWarning[]` for same-day, unavailable-constraint, and partial-availability cases. Reuses `normalizeConstraintDate`, `classifyPartial`, `overlapWithShift`, `getDayLabel`, `getShiftTypeLabel`. Hebrew strings written in normal logical order.
- `frontend/src/pages/admin/components/AssignmentWarningsDialog.tsx` — presentation-only dialog mirroring `PublishWarningsDialog`'s visual style with assign-specific copy (`אזהרות שיבוץ`, `ביטול`, `שבץ בכל זאת`).
- `frontend/src/pages/ScheduleBoardPage.tsx` — prefetches constraints + active shift definitions once on `weekId` change, reuses them for both publish and assign warning paths, intercepts `ShiftAssignmentModal.onConfirm` to compute warnings, and renders the new dialog when warnings exist.
- Spec file created up front and kept as source of truth.

Backend untouched. `useAdminDashboard`, `ShiftAssignmentModal`, `ShiftCell`, `ScheduleBoard`, `api.ts` unchanged. Validation: `tsc --noEmit`, `lint`, `format:check`, `build` all clean. Manual verification by user passed (same-day, unavailable, partial, no-warning, remove flows).
