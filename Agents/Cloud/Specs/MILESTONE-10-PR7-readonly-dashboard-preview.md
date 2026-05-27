# MILESTONE-10-PR7 — Admin Dashboard schedule preview should be read-only (Issue #82)

## Goal

Make the Admin Dashboard's schedule preview an explicitly read-only view. Manual editing (drag-to-move, click-to-assign modal, remove assignment, undo toast) must remain available only on the dedicated schedule editing page (`ScheduleBoardPage`). The dashboard becomes a quick monitoring screen.

## Scope

- Add an explicit `readOnly?: boolean` prop to the shared `ScheduleBoard` component.
- When `readOnly={true}`, the board nullifies all edit callbacks internally and force-disables drag on all `ShiftCell` instances.
- `AdminDashboardPage` passes `readOnly` on its `<ScheduleBoard>` instance.

## Out of Scope

- Backend changes.
- Issues #83, #78, #84.
- Any changes to undo behavior, modal UX, conflict warnings dialog, or assignment modal beyond ensuring they only apply on the edit page (which is already the case).
- Density/variant changes — `variant="compact"` remains a separate concern (layout density), not coupled to read-only.
- Renaming or restructuring `ScheduleBoard` / `ShiftCell`.

## Current Findings

- `frontend/src/pages/AdminDashboardPage.tsx:100-106` renders `<ScheduleBoard variant="compact" />` with **no edit callbacks**. Assign/remove buttons are callback-gated and correctly hidden.
- **Leak**: `frontend/src/pages/admin/components/ShiftCell.tsx:229` — `useDraggable` is `disabled: dragDisabled || !assignmentId`. It doesn't check whether `onMoveAssignment` is wired, so dashboard chips are still draggable (grab cursor, drag preview, opacity animation). Drop does nothing because `ScheduleBoard.handleDragEnd` early-returns when `onMoveAssignment` is undefined, but the visible drag interaction shouldn't happen at all.
- `ScheduleBoardPage.tsx` (the edit page) renders the same component with `variant="full"` and all edit callbacks (`onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment`) + owns `UndoToast`, `ShiftAssignmentModal`, `AssignmentWarningsDialog`. Read-only intent today is implicit (just omit callbacks).
- `UndoToast` lives in `ScheduleBoardPage` only — dashboard never renders it.

## Implementation Plan

1. **`frontend/src/pages/admin/components/ScheduleBoard.tsx`**
   - Add `readOnly?: boolean` to `ScheduleBoardProps` (default `false`).
   - At the top of the component, when `readOnly === true`:
     - Treat `onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment`, `onShiftClick` as `undefined` before they're passed to `ShiftCell`.
     - Force `dragDisabled = true` on every `ShiftCell`.
   - Short-circuit `handleDragEnd` when `readOnly` (defensive; `onMoveAssignment` will already be undefined).

2. **`frontend/src/pages/AdminDashboardPage.tsx`**
   - On the `<ScheduleBoard>` instance (around line 100-106) pass `readOnly`.

3. **`ShiftCell.tsx`**: no changes. Read-only behavior is fully expressed by "no callbacks + dragDisabled=true". This keeps the diff minimal and avoids prop duplication.

4. **`ScheduleBoardPage.tsx`**: no changes. `readOnly` defaults to `false`, so editing behavior is preserved.

## Files to Inspect

- `frontend/src/pages/AdminDashboardPage.tsx`
- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/admin/components/ScheduleBoard.tsx`
- `frontend/src/pages/admin/components/ShiftCell.tsx`

## Files to Change

- `frontend/src/pages/admin/components/ScheduleBoard.tsx` — add `readOnly` prop, gate callbacks/drag.
- `frontend/src/pages/AdminDashboardPage.tsx` — pass `readOnly` on dashboard's `<ScheduleBoard>`.

## Guardrails

- Backend untouched.
- Do not handle #83, #78, or #84 in this PR.
- Preserve all PR2–PR6 behavior in `ScheduleBoardPage` (assign, remove, warnings, undo, drag-to-move).
- Do not redesign UI.
- Do not introduce memoization/performance changes.
- Default for `readOnly` must be `false` so existing callers (edit page) remain editable.
- Hebrew/RTL layout unchanged on both pages.

## Validation Checklist

- [ ] TypeScript compiles without errors (`cd frontend && npx tsc --noEmit`)
- [ ] Prettier passes (`npm run format:check`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual: dashboard chips show no grab cursor, cannot be dragged, no drag overlay, no opacity animation.
- [ ] Manual: dashboard cells are not clickable / not keyboard-focusable as buttons; no modal opens.
- [ ] Manual: dashboard chip rows have no `הסר` button.
- [ ] Manual: dashboard `חסר עובד` placeholder buttons remain visually present but disabled.
- [ ] Manual: no undo toast appears from dashboard interactions.
- [ ] Manual: `ScheduleBoardPage` still supports assign / remove / drag-to-move / warnings dialog / undo toast.

## Final Implementation Summary

- Added `readOnly?: boolean` prop (default `false`) to `ScheduleBoardProps` in `frontend/src/pages/admin/components/ScheduleBoard.tsx`.
- Inside `ScheduleBoard`, when `readOnly` is `true` the component computes "effective" versions of all edit callbacks (`onShiftClick`, `onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment`) as `undefined`, and forces `dragDisabled` to `true`. These effective values are what's passed to `ShiftCell`, and `handleDragEnd` short-circuits on the effective move callback. This single switch suppresses click-to-assign, remove button, drag interaction, drop animation, and the implicit cell-as-button behavior in one place.
- `AdminDashboardPage.tsx` now passes `readOnly` on its `<ScheduleBoard variant="compact" readOnly />` instance.
- `ShiftCell.tsx` unchanged — the existing callback-gating (assign button disabled, remove button hidden) plus the new `dragDisabled=true` flow handles all read-only behavior.
- `ScheduleBoardPage.tsx` unchanged; defaults to editable.
- Validation passed: `npx tsc --noEmit` clean, `npm run format:check` clean, `npm run lint` reports only pre-existing backend warnings (no new issues), `npm run build` succeeds.
