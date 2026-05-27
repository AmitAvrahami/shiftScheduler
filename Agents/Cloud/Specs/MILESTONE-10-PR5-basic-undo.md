# MILESTONE-10-PR5 — Basic Undo for Manual Schedule Edits

## Goal

After a successful manual assign or remove on the Schedule Board, show a transient Hebrew toast with a "בטל" button. Clicking "בטל" calls the inverse API to revert just that last action. Auto-dismisses after 8 seconds. Session-local, last-action only. No backend changes.

## Scope

- Frontend-only undo for the last manual assign/remove performed in the current session.
- Toast appears bottom-right (consistent with existing `AdminDashboardPage` toast palette).
- `useAdminDashboard.assignEmployee` returns the real created assignment id from the API response.
- Undo of an assign → `DELETE /assignments/:id` using that id.
- Undo of a remove → `POST /assignments` with `{shiftId, userId, scheduleId, assignedBy: 'manager'}` snapshotted before the original delete.
- Undo bypasses `AssignmentWarningsDialog` (silent restoration).

## Out of Scope

- Backend changes (no DTO, no schema, no controller, no service, no new endpoints).
- Multi-step undo / history list / stack.
- Redo.
- Persisting undo across page reloads.
- Drag-and-drop.
- Fix for issue #78 (regenerate-preserves-manual overstaffing).
- Solver/regeneration behavior changes.
- Audit-log-driven replay.

## Current Findings

- `assignmentApi.create` (`frontend/src/lib/api.ts:427`) returns `{ success, assignment: Assignment }` with `_id`. The current hook discards it.
- `assignmentApi.delete` (`frontend/src/lib/api.ts:439`) exists and is what we need for undo-of-assign.
- `useAdminDashboard.assignEmployee` (`frontend/src/pages/admin/hooks/useAdminDashboard.ts:159-177`) returns `void` today.
- `useAdminDashboard.removeEmployee` (`:179-193`) only knows the `assignmentId` — caller (`ScheduleBoardPage`) must snapshot `{shiftId, userId, scheduleId}` before calling.
- `dashboard.scheduleId` is available on the dashboard DTO.
- Existing toast pattern: `AdminDashboardPage.tsx:153-173` (fixed bottom-right, role badge by type).
- Helpers `getDayLabel` + `getShiftTypeLabel` + `normalizeShiftDay` live in `frontend/src/pages/admin/utils/scheduleBoardUtils.ts`.

## Implementation Plan

1. Create `frontend/src/components/ui/UndoToast.tsx` — presentation-only:
   - Props `{ message: string; onUndo: () => void; onDismiss: () => void; busy?: boolean }`.
   - Mounts a `setTimeout(onDismiss, 8000)` in `useEffect`; clears on unmount or message change.
   - Fixed bottom-right; blue/info palette; "בטל" button + close `✕`.
   - Disables "בטל" when `busy`.
2. Modify `useAdminDashboard.ts`:
   - `assignEmployee(shiftId, userId)` returns `Promise<string | null>` — the new `assignment._id` on success or `null` on error.
3. Modify `ScheduleBoardPage.tsx`:
   - Add `pendingUndo: PendingUndo | null` state where:
     ```ts
     type PendingUndo =
       | { kind: 'assign'; assignmentId: string; message: string }
       | { kind: 'remove'; shiftId: string; userId: string; scheduleId: string; message: string };
     ```
   - Add `undoBusy: boolean` state.
   - Helper `buildShiftLabel(shift): string` — uses `normalizeShiftDay` → `getDayLabel`, plus `getShiftTypeLabel(shift.type)`. Returns e.g. `"בוקר, ראשון"`.
   - On no-warning assign confirm and on warnings-dialog confirm: capture `employee.name` + `buildShiftLabel(shift)` from the current dashboard, `await actions.assignEmployee(...)`. If it returned an id, `setPendingUndo({kind:'assign', assignmentId, message: 'נוסף שיבוץ: <name> → <shiftLabel>'})`.
   - On remove (`onRemoveEmployee`): look up the assignment via `dashboard.assignments.find(a => a.id === assignmentId)`; resolve `employee.name` + the shift; snapshot `{shiftId, userId, scheduleId: dashboard.scheduleId}`; then `await actions.removeEmployee(assignmentId)`; on success `setPendingUndo({kind:'remove', ..., message: 'הוסר שיבוץ: <name> → <shiftLabel>'})`.
   - Render `<UndoToast>` when `pendingUndo` is non-null.
   - `handleUndo`:
     - Set `undoBusy = true`.
     - If `kind === 'assign'`: `await assignmentApi.delete(pendingUndo.assignmentId)`.
     - If `kind === 'remove'`: `await assignmentApi.create({shiftId, userId, scheduleId, assignedBy:'manager'})`.
     - On success: `await refresh()`; clear `pendingUndo`.
     - On failure: `setPageError(...)`; clear `pendingUndo`.
     - Finally clear `undoBusy`.
4. Hebrew strings (verbatim, normal logical order):
   - Button: `בטל`
   - Assign toast: `נוסף שיבוץ: ${name} → ${shiftLabel}`
   - Remove toast: `הוסר שיבוץ: ${name} → ${shiftLabel}`
   - Undo failure inline: `הפעולה לא הצליחה`

## Files to Inspect

- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts`
- `frontend/src/lib/api.ts` (assignmentApi)
- `frontend/src/pages/admin/utils/scheduleBoardUtils.ts`
- `frontend/src/pages/admin/types.ts`

## Files to Change

- `frontend/src/components/ui/UndoToast.tsx` (new)
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts` (modify — assignEmployee return type)
- `frontend/src/pages/ScheduleBoardPage.tsx` (modify — undo wiring)
- `Agents/Cloud/Specs/MILESTONE-10-PR5-basic-undo.md` (this file, new)

## Guardrails

- No backend changes.
- Use existing assignment endpoints only.
- Use the real assignment id returned from `assignmentApi.create`; do not fabricate.
- Undo of a remove must re-create with `assignedBy: 'manager'`.
- All Hebrew strings written in normal logical order. Never reversed.
- Undo path must NOT re-open `AssignmentWarningsDialog`.
- PR 3 warnings continue to trigger for fresh manual assignments.
- Only the latest manual action is undoable; a new manual edit replaces the pending undo.

## Validation Checklist

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run build` passes
- [ ] Manual: assign → toast with "נוסף שיבוץ" + "בטל" → click "בטל" → assignment disappears, toast clears.
- [ ] Manual: remove → toast with "הוסר שיבוץ" + "בטל" → click "בטל" → assignment restored.
- [ ] Manual: wait 8s without clicking → toast disappears, edit persists.
- [ ] Manual: trigger second edit while toast visible → toast replaces.
- [ ] Manual: PR 3 conflict warnings still trigger on fresh assign (not on undo).
- [ ] Manual: PR 4 "נערך ידנית" badge still raised after assign/remove and after undo.

## Final Implementation Summary

Implemented exactly as planned. One new component, two modified files, plus this spec:

- `frontend/src/components/ui/UndoToast.tsx` (new) — presentation-only Hebrew RTL toast with "בטל" button, close `✕`, and an 8s auto-dismiss via `useEffect + setTimeout`. Blue/info palette.
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts` (modified) — `assignEmployee` now returns `Promise<string | null>` (the real `assignment._id` from `assignmentApi.create` response or `null` on error). `removeEmployee` now returns `Promise<boolean>` so the page can decide whether to surface an undo toast.
- `frontend/src/pages/ScheduleBoardPage.tsx` (modified) — added `PendingUndo` discriminated union, `pendingUndo` + `undoBusy` state, `performAssignWithUndo` / `performRemoveWithUndo` helpers (both snapshot the data needed for the inverse call before invoking the hook), `handleUndo` (calls `assignmentApi.delete` for assign-undo, `assignmentApi.create` with `assignedBy:'manager'` for remove-undo, then `refresh()`), and renders `<UndoToast>` when `pendingUndo` is non-null. The toast is wired through both the no-warning assign path and the `AssignmentWarningsDialog` confirm path; the warnings dialog is **not** re-opened during undo.

Backend untouched. Hebrew strings in normal logical order: `בטל`, `נוסף שיבוץ: ${name} → ${shiftLabel}`, `הוסר שיבוץ: ${name} → ${shiftLabel}`, `הפעולה לא הצליחה`. Shift label uses existing helpers `normalizeShiftDay` + `getDayLabel` + `getShiftTypeLabel`.

Validation: `tsc --noEmit` clean, `npm run lint` clean (only 6 pre-existing backend test warnings, unrelated), `npm run format:check` clean, `npm run build` clean.
