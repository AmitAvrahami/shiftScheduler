# MILESTONE-10-PR4 — Manually Edited Schedule Indicator

## Goal

After a manager manually assigns or removes an employee on a generated schedule, surface a clear, persistent UI indication that the schedule was manually modified — so the displayed quality score is read with the right context. Frontend-only; no solver re-run, no score recalculation.

## Scope

- Add a small, pure util that decides whether the current schedule has been manually edited, based on audit log entries already returned by the admin dashboard DTO.
- Extend `QualityScorePanel` with an optional `manuallyEdited` prop. When true: render a small amber `נערך ידנית` pill in the panel header and a short helper line inside the panel.
- In `AdminDashboardPage`, compute the flag from `dashboard.auditLogs` and pass it to the persistent `QualityScorePanel` instance. Do **not** pass it to the fresh-generation `QualityScorePanel` rendered by `GeneratedSchedulePanel`.

## Out of Scope

- Backend changes (no DTO, no schema, no controller, no service, no audit log changes).
- Solver re-run or quality-score recalculation after manual edits.
- Drag-and-drop.
- Undo.
- A dedicated `Schedule.manuallyEdited` flag on the model.
- Clearing the badge automatically on regenerate (see Risks / Follow-ups).

## Current Findings

- Admin dashboard DTO already exposes `auditLogs: AdminDashboardAuditLog[]` (`frontend/src/pages/admin/types.ts:55,78`).
- Solver writes a single `schedule_generated` audit log (`backend/src/services/schedulerService.ts:148`) and does not write per-assignment audit rows when bulk-inserting (`schedulerService.ts:110`).
- The manual assignment controller writes `assignment_created` (`backend/src/controllers/assignmentController.ts:67–75`) and `assignment_deleted` (`:189–197`).
- Regeneration deletes algorithm assignments via `Assignment.deleteMany` without writing per-assignment audit rows.
- ⇒ Presence of any audit log with `action === 'assignment_created'` or `'assignment_deleted'` is a reliable signal that this schedule has been manually edited.
- Quality score is displayed persistently at `frontend/src/pages/AdminDashboardPage.tsx:125` and (only on fresh generation) inside `GeneratedSchedulePanel.tsx:107–109`.

## Implementation Plan

1. Create `frontend/src/utils/scheduleManualEdit.ts` exporting `isScheduleManuallyEdited(auditLogs)` that returns `true` iff any entry has `action === 'assignment_created'` or `'assignment_deleted'`.
2. Modify `frontend/src/pages/admin/components/QualityScorePanel.tsx`:
   - Add `manuallyEdited?: boolean` to `QualityScorePanelProps` (default `false`).
   - When `manuallyEdited` is true, render an amber pill `נערך ידנית` in the header row.
   - When `manuallyEdited` is true, render one helper line below the total-penalty card: `הסידור עבר שינוי ידני, לכן מדד האיכות המקורי עשוי לא לשקף את המצב הנוכחי.` with a small `warning` icon.
3. Modify `frontend/src/pages/AdminDashboardPage.tsx`:
   - Compute `const manuallyEdited = isScheduleManuallyEdited(dashboard?.auditLogs);`.
   - Pass `manuallyEdited={manuallyEdited}` to the persistent `<QualityScorePanel score={visibleGenerationScore} />`.
   - Do not touch the call from `GeneratedSchedulePanel`.

## Files to Inspect

- `frontend/src/pages/admin/types.ts`
- `frontend/src/pages/admin/components/QualityScorePanel.tsx`
- `frontend/src/pages/admin/components/GeneratedSchedulePanel.tsx`
- `frontend/src/pages/AdminDashboardPage.tsx`
- `backend/src/services/schedulerService.ts` (read-only verification)
- `backend/src/controllers/assignmentController.ts` (read-only verification)

## Files to Change

- `frontend/src/utils/scheduleManualEdit.ts` (new)
- `frontend/src/pages/admin/components/QualityScorePanel.tsx` (modify)
- `frontend/src/pages/AdminDashboardPage.tsx` (modify)
- `Agents/Cloud/Specs/MILESTONE-10-PR4-manual-edit-indicator.md` (new, this file)

## Guardrails

- No backend, no schema, no API changes.
- No solver invocation, no score recalculation.
- All Hebrew strings written in normal logical order. Never reversed.
- `manuallyEdited` prop must be optional with a falsy default so existing `<QualityScorePanel>` call sites behave unchanged.
- Reuse the existing amber palette already used by `AssignmentWarningsDialog` and `PublishWarningsDialog`.

## Validation Checklist

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run build` passes
- [ ] Manual: generated schedule without manual edits → no badge, no helper line.
- [ ] Manual: after a manual assign + refresh → badge `נערך ידנית` appears next to the quality score, helper line shows below the total.
- [ ] Manual: after a manual remove + refresh → badge still appears.
- [ ] Manual: existing assign/remove warnings flow (PR 3) still triggers normally.
- [ ] Manual: fresh-generation `GeneratedSchedulePanel` quality score has no badge.

## Final Implementation Summary

Implemented exactly as planned. One new util file, two modified files (plus this spec):

- `frontend/src/utils/scheduleManualEdit.ts` — pure `isScheduleManuallyEdited(auditLogs)` that returns true iff any log has `action` in `{'assignment_created', 'assignment_deleted'}`.
- `frontend/src/pages/admin/components/QualityScorePanel.tsx` — added optional `manuallyEdited` prop (default `false`). When true: amber `נערך ידנית` pill in the header (right side, paired with the existing `generatedAtLabel`) and an amber helper row below the total-penalty card with the message `הסידור עבר שינוי ידני, לכן מדד האיכות המקורי עשוי לא לשקף את המצב הנוכחי.`.
- `frontend/src/pages/AdminDashboardPage.tsx` — computed `manuallyEdited` from `dashboard?.auditLogs` and passed it only to the persistent `<QualityScorePanel>` instance. `GeneratedSchedulePanel`'s embedded panel was not touched.

Backend untouched. Validation: `tsc --noEmit`, `lint` (only 6 pre-existing backend test warnings, unrelated), `format:check`, and `npm run build` all clean.
