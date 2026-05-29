# ISSUE-16: Template Shift Materialization Concurrency

## Context

`fillMissingTemplateShifts` is idempotent for sequential calls, but its current
read-then-insert flow can race under concurrent materialization. Two callers can
both observe the same missing template shifts before either insert completes.

## Current Guarantees

- `fillMissingTemplateShifts` lives in
  `backend/src/services/shiftGenerationService.ts`.
- `Shift` already declares a unique index on
  `{ scheduleId: 1, date: 1, definitionId: 1 }`.
- No schema change is needed unless the declared index proves insufficient.

## Implementation Plan

- Replace the missing-shift `insertMany` path with atomic upserts keyed by
  `{ scheduleId, definitionId, date }`.
- Use `$setOnInsert` so existing shifts are never overwritten.
- Treat duplicate-key races as benign if a follow-up read confirms all expected
  template shifts now exist.
- Preserve the existing return shape: `{ created, skipped }`.

## Tests

- Concurrent `Promise.all` calls to `fillMissingTemplateShifts` do not throw.
- Final shift count equals the expected template count.
- No duplicate `{ scheduleId, definitionId, date }` combinations exist.
- A repeated call after materialization returns `created: 0`.
