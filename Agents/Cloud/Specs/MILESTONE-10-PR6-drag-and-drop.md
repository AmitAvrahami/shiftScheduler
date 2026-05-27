# MILESTONE-10-PR6 — Drag & Drop for Manual Schedule Editing

## Goal

Add a minimal drag-and-drop UX on top of the manual edit flow from PR 2–PR 5: dragging an existing employee chip from one shift cell to another performs an atomic move. Reuses PR 3 conflict warnings before completing the move and extends PR 5 undo with a third `move` kind so a single "בטל" click reverts the whole move. No backend changes; no new gestures beyond chip → cell move.

## Scope

- Frontend-only drag-to-move (chip in shift X → empty area of shift Y).
- New dependency: `@dnd-kit/core` only.
- `ScheduleBoard` wraps the grid in `DndContext` + sensors and renders a `DragOverlay` clone.
- `ShiftCell` becomes both a `useDroppable` (cell, id = shiftId) and the host for `useDraggable` chips (id = assignmentId).
- `ScheduleBoardPage` owns the move execution, conflict gating, and the new `move` branch of `PendingUndo`.
- Create-then-delete API order via direct `assignmentApi` calls (the existing hook does single-step assign/remove; we don't widen its surface).

## Out of Scope

- Drag-to-remove zone / trash target.
- Draggable side panel for fresh assigns from the employee list.
- Multi-select drag.
- Chip reordering inside a cell.
- Backend changes (no DTO, no schema, no controller, no service, no new endpoints).
- Capacity enforcement / issue #78.
- Solver/regenerate behavior changes.
- Audit-log-driven replay.

## Current Findings

- `dnd-kit` is **not** in `frontend/package.json` (memory said it was — stale).
- `ScheduleBoard` (`frontend/src/pages/admin/components/ScheduleBoard.tsx`) renders the 3×7 grid, calls `<ShiftCell>` per cell. Owns no interactive state today.
- `ShiftCell` (`frontend/src/pages/admin/components/ShiftCell.tsx`) renders chips (lines 143–173) and `חסר עובד` missing-slot buttons (lines 183–196). Cell wrapper has an `onShiftClick` handler that is unused on this page (page passes only `onAssignEmployee` and `onRemoveEmployee`).
- `ScheduleBoardPage` already has `performAssignWithUndo`, `performRemoveWithUndo`, `handleUndo`, `pendingAssignment`, `pendingUndo`, `pendingUndo.kind: 'assign' | 'remove'`, `<AssignmentWarningsDialog>` and `<UndoToast>` — full PR 5 plumbing in place to extend.
- `detectAssignmentConflicts` (`frontend/src/utils/assignmentConflicts.ts`) accepts `{targetShift, candidateEmployeeId, employees, shifts, assignments, constraints, shiftDefinitions}` and returns `AssignmentWarning[]`.
- `assignmentApi.create` returns `{ success, assignment: { _id, ... } }`; `assignmentApi.delete(id)` exists.

## Implementation Plan

1. Add `@dnd-kit/core` to `frontend/package.json` and lockfile via `npm install`.
2. `ShiftCell.tsx`:
   - Import `useDraggable` and `useDroppable` from `@dnd-kit/core`.
   - New optional prop `dragDisabled?: boolean` (passed through from board → page).
   - Make the cell wrapper a `useDroppable` node with `id: shift.id` and `disabled: dragDisabled`. Add a soft outline class when `isOver`.
   - Replace each employee chip `<div>` with a child component `<DraggableChip>` that calls `useDraggable({ id: assignment.id, data: { sourceShiftId: shift.id, employeeId: employee.id }, disabled: dragDisabled })`. Spreads `attributes` + `listeners`, refs the node, dims via `opacity-40` when `isDragging`. The remove button stays inside the chip; it gets `event.stopPropagation()` (it already does) and `onPointerDown={(e) => e.stopPropagation()}` so the drag sensor doesn't grab it.
3. `ScheduleBoard.tsx`:
   - New props: `onMoveAssignment?: (args: { sourceAssignmentId: string; fromShiftId: string; toShiftId: string; userId: string }) => void;` and `dragDisabled?: boolean`.
   - Wrap the rendered grid in `<DndContext>` with:
     - `sensors`: `PointerSensor` w/ `activationConstraint: { distance: 5 }`, `TouchSensor` w/ `{ delay: 200, tolerance: 8 }`. `useSensors(...)`.
     - `onDragStart`: capture `activeDrag = { assignmentId, employeeName }` from `event.active.data.current`.
     - `onDragEnd`: if `over?.id` exists and `over.id !== active.data.current.sourceShiftId`, call `onMoveAssignment({...})`. Always clear `activeDrag`.
     - `onDragCancel`: clear `activeDrag`.
   - Render `<DragOverlay>` after the grid. When `activeDrag` is set, render a small `<div>` styled like a chip with the employee name.
4. `ScheduleBoardPage.tsx`:
   - Extend `PendingUndo` with the `move` kind:
     ```ts
     | { kind: 'move'; revertAssignmentId: string; fromShiftId: string; userId: string; scheduleId: string; message: string }
     ```
   - Add `pendingMove` state of shape `{ sourceAssignmentId, fromShiftId, toShiftId, userId, warnings: AssignmentWarning[] } | null`.
   - Helper `performMoveWithUndo(sourceAssignmentId, fromShiftId, toShiftId, userId)`:
     - Snapshot `employeeName`, `toShiftLabel`, `scheduleId`.
     - `await assignmentApi.create({shiftId: toShiftId, userId, scheduleId, assignedBy: 'manager'})`. Extract `newAssignmentId`. On create error → `setPageError('הפעולה לא הצליחה')`, abort.
     - `await assignmentApi.delete(sourceAssignmentId)`. On delete error → `setPageError('הפעולה לא הצליחה')`, `await refresh()`, no undo toast, return.
     - `await refresh()`. Set `pendingUndo = {kind:'move', revertAssignmentId: newAssignmentId, fromShiftId, userId, scheduleId, message: 'הועבר שיבוץ: <name> → <toShiftLabel>'}`.
   - Helper `handleMoveAssignment({sourceAssignmentId, fromShiftId, toShiftId, userId})`:
     - Early no-op if `fromShiftId === toShiftId` or if `dashboard.assignments` already has `{shiftId:toShiftId, employeeId:userId}`.
     - Resolve `targetShift` from `dashboard.shifts`; bail if missing.
     - `detectAssignmentConflicts` with `assignments.filter(a => a.id !== sourceAssignmentId)`.
     - If `warnings.length === 0`: call `performMoveWithUndo`. Otherwise `setPendingMove({...})`.
   - Pass `onMoveAssignment={handleMoveAssignment}` and `dragDisabled={refreshing}` to `<ScheduleBoard>`.
   - Render a second `<AssignmentWarningsDialog>` gated on `pendingMove !== null` — onCancel clears `pendingMove`; onConfirm clears `pendingMove` and calls `performMoveWithUndo(...)`.
   - Extend `handleUndo` with a `move` branch: `await assignmentApi.delete(revertAssignmentId)`, then `await assignmentApi.create({shiftId: fromShiftId, userId, scheduleId, assignedBy:'manager'})`, then `refresh()`.

## Files to Inspect

- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/components/ScheduleBoard.tsx`
- `frontend/src/pages/admin/components/ShiftCell.tsx`
- `frontend/src/utils/assignmentConflicts.ts`
- `frontend/src/lib/api.ts` (assignmentApi)
- `frontend/package.json`

## Files to Change

- `frontend/package.json` + `frontend/package-lock.json` — add `@dnd-kit/core`.
- `frontend/src/pages/admin/components/ScheduleBoard.tsx` — DndContext, sensors, DragOverlay, new props.
- `frontend/src/pages/admin/components/ShiftCell.tsx` — `useDroppable` on cell, `<DraggableChip>` for chips, `dragDisabled` prop.
- `frontend/src/pages/ScheduleBoardPage.tsx` — `PendingUndo` extension, `pendingMove` state, `performMoveWithUndo`, `handleMoveAssignment`, second warnings dialog, `handleUndo` move branch.
- `Agents/Cloud/Specs/MILESTONE-10-PR6-drag-and-drop.md` (this file, new).

## Guardrails

- No backend changes.
- Use existing assignment endpoints only.
- Add `@dnd-kit/core` only (no `@dnd-kit/utilities`, no `@dnd-kit/sortable`).
- Create-then-delete order so a failed create leaves the source intact.
- Atomic move undo via new `kind: 'move'` PendingUndo.
- Conflict detection must exclude the source assignment (`assignments.filter(a => a.id !== sourceAssignmentId)`).
- Undo path must NOT re-open `AssignmentWarningsDialog`.
- Existing click flows (X button remove, empty-slot click → modal) must keep working — chip drag activation distance ≥ 5px on pointer, and remove button calls `event.stopPropagation()` on `onPointerDown` and `onClick`.
- All Hebrew strings written in normal logical order; never reversed.
- Only the latest manual action is undoable; a new manual edit replaces the pending undo.

## Validation Checklist

- [ ] `cd frontend && npm install` updates lockfile cleanly
- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run build` passes
- [ ] Manual: drag chip from shift X to shift Y → chip moves, toast `הועבר שיבוץ: ${name} → ${toShiftLabel}` with `בטל`.
- [ ] Manual: click `בטל` → chip returns to X, board refreshes.
- [ ] Manual: drag chip onto its own shift → silent no-op.
- [ ] Manual: drag chip onto a shift where that employee is already assigned → silent no-op.
- [ ] Manual: drag triggering a conflict → warnings dialog; cancel = no change; confirm = move + undo toast.
- [ ] Manual: click X button (remove) — still works, no drag.
- [ ] Manual: click empty slot → assign modal opens.
- [ ] Manual: PR 4 "נערך ידנית" badge raised after a move.

## Final Implementation Summary

Implemented as planned. One new dependency, three modified frontend files, plus this spec:

- `frontend/package.json` + lockfile — added `@dnd-kit/core` (`@dnd-kit/utilities` was not required; the source chip is dimmed via `opacity-40` and motion is owned by `DragOverlay`).
- `frontend/src/pages/admin/components/ScheduleBoard.tsx` — wraps the grid in `<DndContext>` with `PointerSensor` (5px activation) and `TouchSensor` (200ms delay, 8px tolerance). Tracks a local `activeDrag` for the `<DragOverlay>` clone (employee name only). Dispatches to a new `onMoveAssignment` prop on drag end with `{sourceAssignmentId, fromShiftId, toShiftId, userId}`. Adds a new `dragDisabled` prop pass-through.
- `frontend/src/pages/admin/components/ShiftCell.tsx` — cell wrapper is now a `useDroppable` node (id = shiftId, disabled when no shift or `dragDisabled`); shows a blue `ring-2` outline while `isOver`. Each chip is rendered via a new `DraggableChip` subcomponent that calls `useDraggable` with the assignment id and `{sourceShiftId, employeeId, employeeName}` data. The remove "הסר" button stops `pointerdown` and `click` propagation so the drag sensor doesn't grab it. Both hook outputs are scoped behind narrow `react-hooks/refs` disables (the v7 rule false-positives on dnd-kit's `setNodeRef` / `attributes` / `listeners` / `isOver` / `isDragging` props, which are not React refs).
- `frontend/src/pages/ScheduleBoardPage.tsx`:
  - Extended `PendingUndo` with a `move` kind (`revertAssignmentId`, `fromShiftId`, `userId`, `scheduleId`, `message`).
  - Added `pendingMove` state for the warnings-gated path.
  - New helper `performMoveWithUndo` — direct create-then-delete via `assignmentApi.create` + `assignmentApi.delete`, captures the returned `_id`, sets the undo with kind `move`, refreshes. On create failure: surface error, source untouched. On delete failure after a successful create: surface error, refresh, no undo toast (state intentionally left with the duplicate so the user can resolve manually).
  - New `handleMoveAssignment` — no-ops on same shift / target already includes that employee / missing target; runs `detectAssignmentConflicts` with the source assignment filtered out; either calls `performMoveWithUndo` directly or stages a `pendingMove` for the warnings dialog.
  - Wired `onMoveAssignment={handleMoveAssignment}` and `dragDisabled={refreshing}` into `<ScheduleBoard>`.
  - Rendered a second `<AssignmentWarningsDialog>` instance gated on `pendingMove`. Cancel clears the intent; confirm calls `performMoveWithUndo`.
  - Extended `handleUndo` with a `move` branch (delete revert id → recreate at `fromShiftId` with `assignedBy: 'manager'` → refresh).

Backend untouched. Hebrew toast string in normal logical order: `הועבר שיבוץ: ${employeeName} → ${toShiftLabel}`. Existing PR 2–PR 5 strings unchanged. Audit logs and the PR 4 "נערך ידנית" badge are preserved (each move produces one `assignment_created` and one `assignment_deleted` log).

Validation: `npm install` clean (3 packages added, 0 vulnerabilities); `npx tsc --noEmit` clean; `npm run lint` clean (only the 6 pre-existing backend unused-vars warnings remain); `npm run format:check` clean; `npm run build` clean (frontend bundle ~458kB / 131kB gzip).
