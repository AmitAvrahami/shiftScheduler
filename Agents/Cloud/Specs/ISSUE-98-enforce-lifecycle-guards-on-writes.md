# ISSUE-98 — Enforce lifecycle guards on solver, shift, and assignment writes

## Goal

Enforce the weekly-schedule lifecycle rule on the backend write paths: **draft (and pre-draft)
schedules are editable; published and archived schedules must not be mutated** by normal
manager/solver paths. Concretely: (1) make the solver write path atomic so a mid-write failure
cannot leave partial output, (2) add a lifecycle guard to `deleteShift`, and (3) add a lifecycle
guard to `createAssignment`. Document (but do not change) the `softDeleteUser` policy.

## Scope

- Wrap the `runScheduler` Phase-4 writes (delete/insert assignments, bulk shift status update, audit
  log, schedule metadata update) in a single Mongoose transaction.
- Add a `published/archived`-blocking guard to `deleteShift`, mirroring `updateShiftRequirement`.
- Add the same guard to `createAssignment`.
- Add a policy comment to `softDeleteUser` documenting the deferred decision.
- Migrate the 5 `runScheduler` test files to `MongoMemoryReplSet` (transactions need a replica set)
  and add atomicity + guard tests.

## Out of Scope

- Any frontend change.
- Issue #96 and Issue #97 work.
- Guards on `createShift`, `updateShift`, `updateAssignment`, `deleteAssignment` (documented
  follow-ups). `updateAssignment` is deliberately untouched because employees legitimately confirm
  their own assignments on **published** schedules.
- Actual soft-delete assignment cleanup/blocking behavior (deferred to a separate issue).
- New workflow states or transition changes.

## Current Findings

### Decisions confirmed with the user

- **Transaction style:** manual `startSession → startTransaction → commit/abort/endSession`, matching
  the two existing sites — **not** `withTransaction()`.
- **deleteShift allow-list:** mirror `updateShiftRequirement` → allow `['open','locked','draft']`,
  block `generating/published/archived` (not draft-only).
- **softDeleteUser:** document policy + defer; no behavioral change this PR.
- **Assignment scope:** guard `createAssignment` only.

### Code grounding

| Path                                       | File:line                                                         | Guard today                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Solver write path                          | `backend/src/services/schedulerService.ts` `runScheduler` ~30–191 | Checks `status === 'generating'` (line 39); **no transaction** around the 5 writes (lines 106, 111, 134, 149, 171)                           |
| `updateShiftRequirement` (pattern to copy) | `backend/src/controllers/shiftController.ts:375`                  | ✅ loads schedule via `shift.scheduleId`, blocks `!['open','locked','draft']` → `AppError(…, 422, 'ERR_INVALID_SCHEDULE_STATUS')` (~395–402) |
| `deleteShift`                              | `backend/src/controllers/shiftController.ts:430`                  | ❌ none                                                                                                                                      |
| `createAssignment`                         | `backend/src/controllers/assignmentController.ts:62`              | ❌ none — loads shift+user, never the schedule                                                                                               |
| `softDeleteUser`                           | `backend/src/controllers/userController.ts:103`                   | sets `isActive:false`; no assignment handling                                                                                                |

**Existing transaction pattern to copy** — `backend/src/services/shiftGenerationService.ts:290–337`
(also `scheduleController.ts:65–75`):

```ts
const session = await mongoose.startSession();
session.startTransaction();
try {
  // ...Model.create([{...}], { session }) / .session(session)...
  await session.commitTransaction();
  return result;
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  session.endSession();
}
```

Inside a session, `Model.create` must use the **array form** `create([{...}], { session })`.

**Test-infra blocker (critical):** every test driving `runScheduler` uses single-node
`MongoMemoryServer`, which **cannot run transactions**: `schedulerService.test.ts`,
`scheduleGenerate.test.ts`, `scheduleGenerate.e2e.test.ts`, `scheduler.canWorkFalse.e2e.test.ts`,
`scheduler.assignmentPreference.test.ts`. `schedule.test.ts` and `workflow.test.ts` already use
`MongoMemoryReplSet` and prove the migration shape.

Shared bits: `WeeklySchedule.status` enum is inline in `backend/src/models/WeeklySchedule.ts`;
`Shift.scheduleId` / `Assignment.scheduleId` are the FK hooks; `AppError(message, statusCode, code?)`
in `backend/src/utils/AppError.ts`. `mongoose`, `WeeklySchedule` already imported in the relevant
files (verify `assignmentController.ts`).

## Implementation Plan

1. **Spec (this file)** — authored before code per CLAUDE.md.
2. **`runScheduler` transaction** — wrap Phase-4 writes (~106–181) in the manual session pattern.
   Build `result`, `assignmentDocs`, `bulkOps`, `generationScore` and keep the
   `status === 'generating'` / INFEASIBLE / timeout throws **outside** the transaction. Pass
   `{ session }` to all five writes:
   - `Assignment.deleteMany({ scheduleId }, { session })`
   - `Assignment.insertMany(assignmentDocs, { session })`
   - `Shift.bulkWrite(bulkOps, { session })`
   - `AuditLog.create([{ … }], { session })` ← convert to array form
   - `WeeklySchedule.updateOne({ _id: scheduleId }, { $set: {…} }, { session })`
     Commit on success; abort + rethrow on error; `endSession` in `finally`.
3. **`deleteShift` guard** — after `Shift.findById` (404), before the deletes:
   ```ts
   const schedule = await WeeklySchedule.findById(shift.scheduleId);
   if (!schedule) return next(new AppError('Schedule not found', 404));
   if (!['open', 'locked', 'draft'].includes(schedule.status)) {
     return next(new AppError('לא ניתן למחוק משמרת בסטטוס זה', 422, 'ERR_INVALID_SCHEDULE_STATUS'));
   }
   ```
4. **`createAssignment` guard** — after `Shift.findById` (404), before `Assignment.create`:
   ```ts
   const schedule = await WeeklySchedule.findById(shift.scheduleId);
   if (!schedule) return next(new AppError('Schedule not found', 404));
   if (!['open', 'locked', 'draft'].includes(schedule.status)) {
     return next(
       new AppError('לא ניתן להוסיף שיבוץ בסטטוס זה', 422, 'ERR_INVALID_SCHEDULE_STATUS')
     );
   }
   ```
   Add `WeeklySchedule` import if missing. Keep the user 404 check.
5. **`softDeleteUser` policy comment** — no behavior change; document that soft-delete sets
   `isActive:false`, historical assignments in published/archived schedules are intentionally
   preserved (published-view shows historical assignee names by design), and assignment
   cleanup/blocking is deferred.
6. **Tests** — see Validation.

## Files to Inspect

- `backend/src/services/schedulerService.ts`
- `backend/src/services/shiftGenerationService.ts` (transaction pattern reference)
- `backend/src/controllers/shiftController.ts`
- `backend/src/controllers/assignmentController.ts`
- `backend/src/controllers/userController.ts`
- `backend/src/controllers/scheduleController.ts`
- `backend/src/models/WeeklySchedule.ts`, `Shift.ts`, `Assignment.ts`
- `backend/src/utils/AppError.ts`
- `backend/src/__tests__/schedule.test.ts`, `workflow.test.ts` (ReplSet setup reference)
- `backend/src/__tests__/schedulerService.test.ts`, `scheduleGenerate.test.ts`,
  `scheduleGenerate.e2e.test.ts`, `scheduler.canWorkFalse.e2e.test.ts`,
  `scheduler.assignmentPreference.test.ts`
- `backend/src/__tests__/shift.test.ts`, `assignment.test.ts`
- `backend/src/__tests__/helpers/shiftDefinitions.ts`

## Files to Change

- `backend/src/services/schedulerService.ts` — transaction wrap
- `backend/src/controllers/shiftController.ts` — deleteShift guard
- `backend/src/controllers/assignmentController.ts` — createAssignment guard
- `backend/src/controllers/userController.ts` — policy comment only
- `Agents/Cloud/Specs/ISSUE-98-enforce-lifecycle-guards-on-writes.md` — this spec
- Tests: migrate 5 scheduler test files to `MongoMemoryReplSet`; add cases to
  `schedulerService.test.ts` (atomicity), `shift.test.ts` (delete guard),
  `assignment.test.ts` (create guard)

## Guardrails

- Use `AppError` (never plain `Error`); reuse status **422** + code `ERR_INVALID_SCHEDULE_STATUS`
  for all three guards so the frontend treats them identically.
- Copy the existing transaction pattern verbatim; do not introduce `withTransaction()`.
- Do not touch `updateAssignment` (employee confirmation on published schedules must keep working).
- No frontend changes; no Issue #96/#97 changes; no new workflow states.
- Keep controllers thin; CSP logic stays in services.
- Migrate test DB setup by copying `schedule.test.ts` verbatim; keep `--runInBand`.

## Validation Checklist

- [x] TypeScript compiles without errors (via `npm run build`)
- [x] Prettier passes (`npm run format:check`) — clean
- [x] ESLint passes (`npm run lint`) — 0 errors (6 pre-existing warnings in untouched test files)
- [x] Build succeeds (`npm run build`)
- [x] Tests pass (`npm test --workspace=backend -- --runInBand`) — 536 passed, 38 suites
  - [x] 5 scheduler test files pass under `MongoMemoryReplSet`
  - [x] runScheduler atomicity test: forced mid-write failure rolls back; no partial output
  - [x] deleteShift: published/archived → 422 `ERR_INVALID_SCHEDULE_STATUS`, shift + assignments preserved; draft → 200
  - [x] createAssignment: published/archived → 422 `ERR_INVALID_SCHEDULE_STATUS`; draft → 201
- [x] UI behavior unchanged (no frontend touched)

## Final Implementation Summary

**What was done**

1. **`runScheduler` atomicity** (`schedulerService.ts`): all five Phase-4 writes
   (`Assignment.deleteMany`, `Assignment.insertMany`, `Shift.bulkWrite`, `AuditLog.create`,
   `WeeklySchedule.updateOne`) now run inside one manual transaction
   (`startSession → startTransaction → commit / abort / endSession`). Pure prep
   (`assignmentDocs`, `bulkOps`, `generationScore`) and the existing `status === 'generating'` /
   INFEASIBLE / timeout throws stay **outside** the transaction. `AuditLog.create` converted to the
   array form required inside a session.
2. **`deleteShift` guard** (`shiftController.ts`): loads the schedule via `shift.scheduleId`,
   blocks `!['open','locked','draft']` with `AppError(…, 422, 'ERR_INVALID_SCHEDULE_STATUS')`.
3. **`createAssignment` guard** (`assignmentController.ts`): same guard, resolved through
   `shift.scheduleId`, placed before the user lookup and `Assignment.create`.
4. **`softDeleteUser` policy comment** (`userController.ts`): documents that soft-delete only sets
   `isActive:false`, historical published/archived assignments are intentionally preserved, and
   draft cleanup/blocking is deferred. No behavioral change.
5. **Tests**: migrated the 5 `runScheduler`-driving suites from `MongoMemoryServer` →
   `MongoMemoryReplSet` (transactions need a replica set). Added: a runScheduler atomic-rollback
   test (forces the final write to throw, asserts prior data intact + no partial output);
   deleteShift published + archived rejection tests with data-preservation asserts; createAssignment
   published + archived rejection tests. Updated the pre-existing "manager can create assignment"
   test to use a draft schedule (it previously seeded a published schedule and would now be blocked
   by the new guard — correct behavior change).

**Decisions made**: manual transaction pattern (not `withTransaction`); guards mirror
`updateShiftRequirement` (`open/locked/draft` allowed) using the shared 422 +
`ERR_INVALID_SCHEDULE_STATUS`; `softDeleteUser` documented-and-deferred.

**Left out (follow-ups)**: guards on `createShift`/`updateShift`/`updateAssignment`/
`deleteAssignment` (note `updateAssignment` must stay open for employee confirmation on published
schedules); actual soft-delete assignment cleanup.

---

### PR metadata

- Branch: `fix/issue-98-lifecycle-write-guards`
- Title: `fix(schedule): enforce lifecycle guards on solver, shift, and assignment writes`
- Go/No-go: **GO** — small, focused, reuses an established transaction pattern and an existing guard
  verbatim; the only non-trivial item (ReplSet test migration) is mechanical and proven in-repo.
