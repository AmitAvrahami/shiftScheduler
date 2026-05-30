# BUG-96 — Stabilize Published Schedule Workflow & Remove Demo Fallbacks

## Goal

Address GitHub Issue #96 with four small, focused stability fixes for milestone M11:

1. Make `cascadeDeleteSchedule` transaction-safe so a partial failure cannot leave orphaned Assignments or Shifts.
2. Wire the schedule lifecycle status into `<ScheduleBoard>` so published/archived schedules are read-only in the manager UI.
3. Remove the silent `MOCK_DEFINITIONS` fallback in `ConstraintPage` so employees cannot submit constraints against fake shift definitions.
4. Remove hardcoded/demo data from the employee `DashboardPage` (hardcoded week label, fake countdown, dead `NotificationsPanel`).

## Scope

- `backend/src/controllers/scheduleController.ts` — transaction-safe `cascadeDeleteSchedule`.
- `frontend/src/pages/ScheduleBoardPage.tsx` — pass `readOnly={!isDraft}` to `<ScheduleBoard>`.
- `frontend/src/pages/ConstraintPage.tsx` — delete `MOCK_DEFINITIONS` and its fallback, render a Hebrew empty state when no active shift definitions exist.
- `frontend/src/pages/DashboardPage.tsx` — dynamic week label, neutral deadline message, delete unused `NotificationsPanel`.
- Branch: `fix/m11-stability-issue-96` from `main`. One focused PR titled `fix(m11): stabilize published schedule workflow and remove demo fallbacks`.

## Out of Scope

- Issues #97 and #98 — explicitly excluded.
- UI redesign, refactors, or memoization changes.
- Modifying `ScheduleBoard.tsx`, `ShiftCell.tsx`, or `useAdminDashboard.ts` internals (`readOnly` is already honored).
- Fetching a real constraint deadline from the backend for DashboardPage (follow-up; #96 accepts a neutral placeholder).
- Changes to the lifecycle state machine, audit-log shape, DTOs, or API contracts.

## Current Findings

### Cascade delete (no transaction)

`backend/src/controllers/scheduleController.ts` lines 47–52:

```ts
async function cascadeDeleteSchedule(scheduleId: mongoose.Types.ObjectId): Promise<void> {
  const shiftIds = await Shift.find({ scheduleId }, '_id').lean();
  await Assignment.deleteMany({ shiftId: { $in: shiftIds.map((s) => s._id) } });
  await Shift.deleteMany({ scheduleId });
  await WeeklySchedule.findByIdAndDelete(scheduleId);
}
```

Callers (all without a session): `createSchedule` (regenerate path, line 116), `deleteSchedule` (line 301), `cloneSchedule` (line 355).

Existing transaction style in `backend/src/services/shiftGenerationService.ts`:

- `initializeWeeklySchedule` (lines 284–337) uses manual `startSession()` + `startTransaction()` + `commitTransaction()` / `abortTransaction()` + `endSession()` in `finally`.
- `fillMissingTemplateShifts` (lines 176–278) accepts an optional `session?: mongoose.ClientSession`, uses `.session(session || null)` on queries and `{ session }` in option objects.
- Issue #16 fix (commits `8c00750`, `917fe42`) reinforces the pattern: use `bulkWrite` atomically, check `session?.inTransaction()` before retry logic.

### ScheduleBoard readOnly not wired

`frontend/src/pages/ScheduleBoardPage.tsx`:

- Line 353: `const isDraft = dashboard?.scheduleStatus === 'draft';`
- Lines 462–471: `<ScheduleBoard>` rendered with `shifts`, `assignments`, `employees`, `warnings`, `onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment`, `dragDisabled={refreshing}` — **no `readOnly` prop**.

`frontend/src/pages/admin/components/ScheduleBoard.tsx`:

- Already accepts `readOnly?: boolean` (line 52, default `false` line 70).
- Lines 80–84 convert it into `undefined` callbacks (`onShiftClick`, `onAssignEmployee`, `onRemoveEmployee`, `onMoveAssignment`) and OR it into `dragDisabled`.
- `ShiftCell.tsx` and `DraggableChip` honor those undefined callbacks and `dragDisabled` for drop targets, drag handles, "assign" button, and "remove" button.
- `AdminDashboardPage.tsx` and `EmployeePublishedSchedulePage.tsx` already pass `readOnly` — only `ScheduleBoardPage.tsx` is missing it.

### MOCK_DEFINITIONS in ConstraintPage

`frontend/src/pages/ConstraintPage.tsx`:

- Lines 29–70 define `MOCK_DEFINITIONS` (3 fake shifts).
- Line 100: `const definitions = defsRes.definitions.length === 0 ? MOCK_DEFINITIONS : defsRes.definitions;`
- Render at line 324+ maps `definitions` per day; with zero real defs the UI silently shows fake shifts.
- Existing banner pattern (lines 248–273) uses `rounded-lg border bg-{color}-50 px-5 py-4 flex items-center gap-3` with a `MaterialIcon` — reuse this look for the empty state.

### DashboardPage demo data

`frontend/src/pages/DashboardPage.tsx`:

- Line 85: hardcoded `<p>לשבוע 44</p>`.
- Lines 91–102: hardcoded countdown card (`<span>2</span> ימים <span>14</span> שעות`) with red error styling.
- Lines 192–229: `NotificationsPanel` exported, never mounted anywhere; contains fake Hebrew notifications.
- Imports already include `getCurrentWeekId` from `../utils/weekUtils`.
- `frontend/src/utils/weekUtils.ts` exports `getCurrentWeekId(): string` and `getWeekLabelParts(weekId)` returning `{ weekNumber, dateRange, ... }`.
- `useEmployeeDashboardData` does **not** return any deadline data — no real deadline is currently available without adding a new API call.

## Implementation Plan

### Step 1 — Branch and spec

1. From `main`: `git pull origin main`, `git checkout -b fix/m11-stability-issue-96`.
2. Confirm this spec file is committed early so the work is tracked.

### Step 2 — Backend: transaction-safe cascade delete

Edit `backend/src/controllers/scheduleController.ts` `cascadeDeleteSchedule` (lines 47–52) to:

```ts
async function cascadeDeleteSchedule(
  scheduleId: mongoose.Types.ObjectId,
  externalSession?: mongoose.ClientSession
): Promise<void> {
  const runDeletes = async (session: mongoose.ClientSession) => {
    // Delete assignments by scheduleId directly (the Assignment model has
    // scheduleId as a required field per backend/src/models/Assignment.ts).
    // This removes any orphan assignments whose shiftId reference is already
    // dangling — safer than filtering by Shift._id alone.
    await Assignment.deleteMany({ scheduleId }, { session });
    await Shift.deleteMany({ scheduleId }, { session });
    await WeeklySchedule.findByIdAndDelete(scheduleId, { session });
  };

  if (externalSession) {
    await runDeletes(externalSession);
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await runDeletes(session);
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
```

Notes:

- `Assignment` schema (`backend/src/models/Assignment.ts`) declares `scheduleId: { type: Schema.Types.ObjectId, ref: 'WeeklySchedule', required: true }` — using it as the cascade key is reliable and removes the need to first query Shift IDs.
- If a future schema change ever makes `scheduleId` unreliable on `Assignment`, fall back defensively to:

  ```ts
  const shiftIds = await Shift.find({ scheduleId }, '_id').session(session).lean();
  await Assignment.deleteMany(
    {
      $or: [{ scheduleId }, { shiftId: { $in: shiftIds.map((s) => s._id) } }],
    },
    { session }
  );
  ```

- Leave the three callers (`createSchedule` line 116, `deleteSchedule` line 301, `cloneSchedule` line 355) unchanged — they will use the internal short-lived transaction automatically. The optional `externalSession` parameter exists for future composition.

### Step 3 — Frontend: wire ScheduleBoard `readOnly`

In `frontend/src/pages/ScheduleBoardPage.tsx`, at the existing `<ScheduleBoard>` JSX (lines 462–471), add `readOnly={!isDraft}`. No other change.

### Step 4 — Frontend: remove MOCK_DEFINITIONS fallback

In `frontend/src/pages/ConstraintPage.tsx`:

1. Delete `MOCK_DEFINITIONS` (lines 29–70) and its preceding comment.
2. Change line 100 to `const definitions = defsRes.definitions;`.
3. In the day-grid render block (around line 324), when `definitions.length === 0`, render a single Hebrew empty-state card **once** (not per-day), using the same visual treatment as the existing info banner (lines 248–273):

```tsx
{definitions.length === 0 ? (
  <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4 flex items-center gap-3">
    <MaterialIcon name="info" className="text-amber-600" />
    <p className="font-semibold text-amber-700">
      אין הגדרות משמרות זמינות כרגע. יש לפנות למנהל המערכת.
    </p>
  </div>
) : (
  /* existing day-grid render */
)}
```

(Final color/icon choices may vary — keep consistent with surrounding banners and Hebrew RTL.)

### Step 5 — Frontend: DashboardPage cleanup

In `frontend/src/pages/DashboardPage.tsx`:

1. Compute the current week at the page level using `getCurrentWeekId()` (already imported) and `getWeekLabelParts(weekId).weekNumber`. Pass `weekId` (or just `weekNumber`) into `ConstraintCountdownCard` as a prop.
2. Replace hardcoded `<p>לשבוע 44</p>` (line 85) with `<p>לשבוע {weekNumber}</p>`.
3. Replace the hardcoded countdown block (lines 91–102) with a single neutral Hebrew message inside the same card frame, softer styling (drop the red `text-error` urgency since there is no real deadline):

```tsx
<div className="text-center py-4 bg-surface-container-low rounded-lg border border-surface-variant mb-4">
  <p className="text-sm text-on-surface-variant">מועד ההגשה יוצג לאחר פתיחת חלון האילוצים</p>
</div>
```

4. Keep the existing "הגש אילוצים" CTA button unchanged.
5. Delete the entire `NotificationsPanel` function (lines 192–229) and its `export`. Confirm nothing imports it (exploration showed nothing does); if a stray import surfaces, remove it.

### Step 6 — Validation

Run all commands from `CLAUDE.md` § Commands. Capture pass/fail for each in the PR body.

### Step 7 — Open PR

Title: `fix(m11): stabilize published schedule workflow and remove demo fallbacks`. Body must include Summary / Verification (every command + result) / Notes (record that `MOCK_DEFINITIONS` was removed entirely and that the dashboard uses a neutral placeholder because no real deadline source is fetched yet) / `Closes #96`.

### Step 8 — Update spec

Fill in the "Final Implementation Summary" section at the bottom of this file once the PR is opened.

## Files to Inspect

- `backend/src/controllers/scheduleController.ts` (target)
- `backend/src/services/shiftGenerationService.ts` (transaction pattern reference, lines 176–337)
- `backend/src/__tests__/schedule.test.ts` (existing cascade-delete and regenerate test coverage)
- `frontend/src/pages/ScheduleBoardPage.tsx` (target)
- `frontend/src/pages/admin/components/ScheduleBoard.tsx` (confirm `readOnly` already gates everything)
- `frontend/src/pages/admin/components/ShiftCell.tsx` (confirm drop/drag/remove honor `dragDisabled` and undefined callbacks)
- `frontend/src/pages/ConstraintPage.tsx` (target)
- `frontend/src/pages/DashboardPage.tsx` (target)
- `frontend/src/utils/weekUtils.ts` (`getCurrentWeekId`, `getWeekLabelParts`)

## Files to Change

- `backend/src/controllers/scheduleController.ts`
- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/ConstraintPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `Agents/Cloud/Specs/BUG-96-stabilize-m11-workflow.md` (this file — Final Implementation Summary updated at end)

## Guardrails

- Do not modify `ScheduleBoard.tsx`, `ShiftCell.tsx`, `DraggableChip`, or `useAdminDashboard.ts` — wiring only.
- Do not add a backend API call for the deadline in DashboardPage (explicit out-of-scope decision).
- Do not introduce new workflow states or change DTOs.
- Hebrew copy stays Hebrew; preserve existing RTL Tailwind classes.
- Do not fix unrelated pre-existing lint/type warnings; report them separately if encountered.
- Do not touch surfaces owned by issues #97 or #98.
- Preserve existing transaction-style conventions; do not switch the project to `session.withTransaction(...)` callback style.
- Hebrew strings must be written in normal logical/typed order, not visually reversed. Required literals exactly as below (do **not** reverse them character-by-character):
  - `"אין הגדרות משמרות זמינות כרגע. יש לפנות למנהל המערכת."`
  - `"מועד ההגשה יוצג לאחר פתיחת חלון האילוצים"`
  - `"לשבוע {n}"`

## Validation Checklist

- [ ] `npm run format` passes
- [ ] `npm run format:check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes (root)
- [ ] `npx tsc --noEmit` passes (run from `frontend/`)
- [ ] `npm test --workspace=backend -- --runInBand` passes — existing cascade tests in `backend/src/__tests__/schedule.test.ts` (lines 304–371 and 175–199) still green
- [ ] Manual: open a published-week board as manager → no drag, no drop, no remove, no "assign employee" click target
- [ ] Manual: open a draft-week board as manager → drag/drop/remove/assign all work as before
- [ ] Manual: load ConstraintPage with zero active shift definitions → Hebrew empty-state card visible, no fake shift cards rendered
- [ ] Manual: load employee DashboardPage → `לשבוע {currentWeek}` shown, neutral Hebrew deadline message shown, no fake notifications panel anywhere on the page

## Final Implementation Summary

Branch: `fix/m11-stability-issue-96`

### Files Changed

- `backend/src/controllers/scheduleController.ts` — `cascadeDeleteSchedule` wrapped in a Mongoose transaction; accepts optional `externalSession` for future composition.
- `backend/src/__tests__/schedule.test.ts` — upgraded `MongoMemoryServer` → `MongoMemoryReplSet` (single-node) so transaction-based cascade delete tests pass.
- `backend/src/__tests__/workflow.test.ts` — same `MongoMemoryReplSet` upgrade so regeneration-cascade tests pass.
- `frontend/src/pages/ScheduleBoardPage.tsx` — added `readOnly={!isDraft}` to `<ScheduleBoard>`.
- `frontend/src/pages/ConstraintPage.tsx` — deleted `MOCK_DEFINITIONS` and its fallback; added Hebrew amber empty-state card when `definitions.length === 0`.
- `frontend/src/pages/DashboardPage.tsx` — `ConstraintCountdownCard` now accepts `weekNumber` prop (from `getWeekLabelParts`); hardcoded week 44 replaced with dynamic week; hardcoded countdown replaced with neutral Hebrew placeholder; `NotificationsPanel` deleted.

### Validation Results

- `npm run format` — pass
- `npm run format:check` — pass
- `npm run lint` — pass (6 pre-existing warnings in unrelated test files, 0 errors)
- `npm run build` — pass
- `cd frontend && npx tsc --noEmit` — pass
- `backend npm test --runInBand` — **519/519 tests pass** (38 suites)

### Behavior Decisions

- `MOCK_DEFINITIONS` removed entirely — employees see a Hebrew empty state when no active shift definitions exist.
- `DashboardPage` deadline shows neutral placeholder (`מועד ההגשה יוצג לאחר פתיחת חלון האילוצים`) because no real deadline source is fetched (follow-up task).
- Test setup files for `schedule.test.ts` and `workflow.test.ts` upgraded to `MongoMemoryReplSet` to support transactions; this is an intentional scope addition required to keep the test suite green after the transaction-safe cascade delete.

### Risks / Follow-ups

- `MongoMemoryReplSet` starts a single-node replica set which is slightly slower than standalone (~2–3 s overhead per suite); acceptable given correctness guarantee.
- Real deadline API for `DashboardPage` deferred (out of scope per spec).
