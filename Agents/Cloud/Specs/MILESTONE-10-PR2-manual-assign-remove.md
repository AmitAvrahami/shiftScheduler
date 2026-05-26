# MILESTONE-10-PR2 — Manual Assign / Remove (Basic)

## Goal

Allow managers to manually assign or remove employees on shifts in the admin Schedule Board, persisted to the database. This is the first interactive piece of Milestone 10 (manual schedule editing) and unblocks the rest of that milestone's UX work.

## Scope

- Expose `POST /assignments` and `DELETE /assignments/:id` in the frontend API client (`assignmentApi.create`, `assignmentApi.delete`).
- Add `assignEmployee(shiftId, userId)` and `removeEmployee(assignmentId)` actions to the `useAdminDashboard` hook. Each action calls the backend, then triggers a silent `refresh()` so KPIs and fill status reload.
- Build a minimal `ShiftAssignmentModal` (employee picker) showing only active employees who are not already on the shift.
- Connect the existing `ShiftCell` buttons ("הסר" remove, "חסר עובד" add) in `ScheduleBoardPage` to these actions.
- All manual edits persist in MongoDB and survive a page refresh.

## Out of Scope

- Drag and drop.
- Conflict / overlap / double-booking detection in the picker.
- Quality-score / penalty recalculation after manual edits.
- Any backend logic, controller, or route changes (unless a small unforeseen blocker forces one — none expected).
- New audit-log actions or fields.
- "Manually modified" badge on the schedule.

## Current Findings

- Backend already supports manager-only create/delete at `backend/src/routes/assignment.routes.ts` (`POST /assignments`, `DELETE /assignments/:id`) and `backend/src/controllers/assignmentController.ts`. `createSchema` requires `shiftId`, `userId`, `scheduleId`, `assignedBy: 'algorithm' | 'manager'`. Both actions audit-log automatically.
- `assignmentApi` in `frontend/src/lib/api.ts` currently only has `getBySchedule` — `create`/`delete` are missing.
- `ShiftCell` (`frontend/src/pages/admin/components/ShiftCell.tsx`) already renders the "הסר" button for assigned employees and the "חסר עובד" button for missing slots, and accepts `onAssignEmployee`/`onRemoveEmployee` props. `ScheduleBoard` plumbs both props down to each cell.
- `ScheduleBoardPage` currently passes only `onAssignEmployee={() => setPageError('פעולה זו עדיין לא זמינה')}` — placeholder.
- `useAdminDashboard` exposes `refresh()` which reloads the admin dashboard DTO; the backend mapper recomputes KPIs (`totalShifts`, `filledShifts`, `missingAssignments`) on every fetch, so calling `refresh()` after an assignment change is enough to keep counts accurate.
- `AdminDashboardEmployee.isActive: boolean` is part of the dashboard DTO — usable to filter the picker.

## Implementation Plan

1. **API client.** In `frontend/src/lib/api.ts` add to `assignmentApi`:
   - `create(body: { shiftId; userId; scheduleId; assignedBy: 'manager' | 'algorithm' })` → `POST /assignments`, returns `{ success; assignment: Assignment }`.
   - `delete(id: string)` → `DELETE /assignments/:id`, returns `{ success: boolean; message?: string }`.
2. **Hook actions.** In `frontend/src/pages/admin/hooks/useAdminDashboard.ts`:
   - Capture `scheduleId` (already present below).
   - Add `assignEmployee(shiftId, userId)`: guard on `scheduleId`, set `refreshing=true`, call `assignmentApi.create({ shiftId, userId, scheduleId, assignedBy: 'manager' })`, await `refresh()`, on failure set Hebrew error.
   - Add `removeEmployee(assignmentId)`: same pattern with `assignmentApi.delete`.
   - Return both under `actions` alongside existing entries.
3. **Modal component.** Create `frontend/src/pages/admin/components/ShiftAssignmentModal.tsx`:
   - Props: `open`, `shift` (`AdminDashboardShift | null`), `employees: AdminDashboardEmployee[]`, `assignedEmployeeIds: Set<string>`, `onCancel()`, `onConfirm(userId)`.
   - Backdrop + centered card matching the staffing modal already in `ScheduleBoardPage`.
   - Body lists active employees not in `assignedEmployeeIds`, with a "שבץ" button per row.
   - Empty-state message when no candidates remain.
4. **Page integration.** In `frontend/src/pages/ScheduleBoardPage.tsx`:
   - Destructure new actions from the hook.
   - Add `assignTargetShiftId` state (`string | null`).
   - Pass real handlers to `<ScheduleBoard>`: `onAssignEmployee={setAssignTargetShiftId}`, `onRemoveEmployee={(id) => actions.removeEmployee(id)}`.
   - Resolve `assignTargetShift` from `dashboard.shifts` and `alreadyAssignedIds` from `dashboard.assignments` for the modal.
   - Render the modal; on confirm, call `actions.assignEmployee(shiftId, userId)` then close.
5. **Validate** (tsc, lint, format, build). Backend tests unchanged so skip.

## Files to Inspect

- `frontend/src/lib/api.ts`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`
- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/components/ScheduleBoard.tsx`
- `frontend/src/pages/admin/components/ShiftCell.tsx`
- `frontend/src/pages/admin/types.ts`
- `frontend/src/pages/admin/utils/scheduleBoardUtils.ts`
- `backend/src/controllers/assignmentController.ts`
- `backend/src/routes/assignment.routes.ts`

## Files to Change

- `frontend/src/lib/api.ts` (modify)
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts` (modify)
- `frontend/src/pages/ScheduleBoardPage.tsx` (modify)
- `frontend/src/pages/admin/components/ShiftAssignmentModal.tsx` (new)

## Guardrails

- Do not change backend code, routes, controllers, schemas, or services.
- Do not introduce drag and drop, conflict checks, or score recalculation.
- Preserve existing permissions/auth flow — frontend continues to send the bearer token via the shared `request` helper.
- Reuse `request`, `Assignment`, `getShiftTypeLabel`, and the existing modal markup style; do not introduce a shared modal abstraction yet.
- Hebrew strings stay in normal logical order in source (e.g., `הסר`, `חסר עובד`).
- No optimistic UI — every successful action goes through `refresh()`.

## Validation Checklist

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format` / `format:check` passes
- [ ] `npm run build` passes
- [ ] Backend untouched → no `npm test --workspace=backend` run required
- [ ] Manual: click "חסר עובד" → modal lists active employees, omits already-assigned; selecting one fills the slot and updates the day's count.
- [ ] Manual: click "הסר" → assignment disappears after refresh; slot returns to "חסר עובד".
- [ ] Manual: hard-refresh the browser; manual edits persist (verifies DB write).

## Final Implementation Summary

- Added `create` and `delete` to `assignmentApi` in `frontend/src/lib/api.ts`.
- Added `assignEmployee(shiftId, userId)` and `removeEmployee(assignmentId)` to `useAdminDashboard`, both reusing the existing `refreshing` flag and silent `refresh()` to repaint the board and KPIs after the server confirms.
- Built `frontend/src/pages/admin/components/ShiftAssignmentModal.tsx`: small picker that lists active employees not already on the shift, with empty-state copy when no candidates remain. Styled to match the existing weekly-staffing modal.
- `ScheduleBoardPage` now opens the modal on "חסר עובד", calls `actions.removeEmployee` on "הסר", and renders the modal alongside `PublishWarningsDialog`.
- Backend untouched. No new audit-log actions; existing `assignment_created` / `assignment_deleted` audit entries fire from the controller.
- Validation: `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run build` all clean. No backend tests run because backend was unchanged.
