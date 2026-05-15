# Manual Verification — `canWork: false` Constraint Flow

Use this checklist whenever you need to hand-verify that an employee marking a
shift as "cannot work" actually prevents that employee from being assigned to
that shift in the generated schedule.

The automated end-to-end coverage lives in
`backend/src/__tests__/scheduler.canWorkFalse.e2e.test.ts`. This document is the
companion smoke test for the live UI.

## Prereqs

- Backend running on port `5001`, frontend on port `5173`.
- Clean dev DB (or at least no in-progress schedule that you would overwrite).
- Two seeded employees and one manager/admin account.
- A weekly schedule for a **future** week (so the constraint deadline has not
  passed). Use the workflow `open → locked → generating` to land in a state
  where the manager can run the solver.

## Steps

1. Log in as **Employee A** (the one who should be blocked).
2. Open the weekly constraints page (`ConstraintPage`).
3. Toggle one specific shift on (mark it as "cannot work" — Hebrew: לא יכול/ה
   לעבוד). Leave every other shift untouched.
4. Submit. Confirm the network panel shows `PUT /api/v1/constraints/{weekId}`
   returns 200 with the saved entries echoing `canWork: false` for the chosen
   `(date, definitionId)`.
5. Log out, log in as the **manager**.
6. From the admin dashboard, generate the schedule for the same week.
7. Inspect the generated `ScheduleBoard` for that week.

## Pass criteria

- [ ] A `Constraint` document exists for Employee A with the expected entry
      (`db.constraints.find({ userId: <A>, weekId })` shows
      `entries: [{ date, definitionId, canWork: false }]`).
- [ ] Backend log line `compileConstraints produced generic payload` shows
      `forbiddenAssignments >= 1` for that run.
- [ ] In the dashboard, the chosen shift is **not** assigned to Employee A.
      It is either assigned to another employee or left empty.
- [ ] No other day/shift assignment changed unexpectedly.
- [ ] No 4xx/5xx in the network panel and no console errors.

## If a criterion fails

Do **not** patch production code as part of a verification pass. Open a bug
with:

- The exact `(weekId, userId, date, definitionId)` that failed.
- The captured `SolveRequest` payload (`forbidden_assignments`,
  `workers[*].availability`) — enable solver-request logging if needed.
- The persisted `Assignment` documents for the schedule.

Then triage in a separate PR.

## Related automated tests

- `backend/src/__tests__/scheduler.canWorkFalse.e2e.test.ts` — solver stub
  honors `forbidden_assignments`; persisted Assignment excludes the forbidden
  pair; multi-shift expansion; baseline with no constraints; definitionId
  mismatch is silently dropped.
- `backend/src/__tests__/schedulerService.test.ts` (dual-payload transport
  section) — same constraint reaches the solver in both `forbidden_assignments`
  and legacy per-worker `availability`.
- `backend/src/__tests__/compiler.normalizer.test.ts` — `canWork: false` becomes
  a hard `availability` domain constraint.
- `backend/src/__tests__/compiler.forbiddenAssignments.test.ts` — domain
  constraint expands into one DTO per matching shift.
