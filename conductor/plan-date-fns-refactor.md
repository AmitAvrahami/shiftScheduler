# Implementation Plan: Date Calculations Refactoring

## Objective
Refactor the backend date calculation logic to use the `date-fns` and `date-fns-tz` libraries. This ensures that the automatic shift generation and schedule boundary calculations correctly handle Daylight Saving Time (DST) and month boundaries, replacing brittle string manipulation and fixed millisecond offsets.

## Key Files & Context
- `backend/package.json`: Needs new dependencies.
- `backend/src/services/shiftGenerationService.ts`: Contains custom date math (`normalizeWeekStart`, `addDays`, `buildDateTime`) that runs when a manager initializes a schedule.
- `backend/src/utils/weekUtils.ts`: Contains fixed offset math (`IST_OFFSET_MS`, `DAY_MS`) and week boundary calculations.

## Implementation Steps
1. **Dependencies**: 
   - Install `date-fns` and `date-fns-tz` in the `backend` workspace.
2. **Refactor `shiftGenerationService.ts`**:
   - Replace `normalizeWeekStart` with `startOfWeek` from `date-fns` (configured for Sunday).
   - Replace `addDays` with `addDays` from `date-fns`.
   - Replace `buildDateTime` string parsing with `parse` and `set` functions from `date-fns` to safely apply hours/minutes to a given Date without string slicing.
   - Update `getShiftDateTimes` to calculate the shift duration correctly across midnight using robust date additions.
3. **Refactor `weekUtils.ts`**:
   - Replace `IST_OFFSET_MS` usage with `date-fns-tz` methods, using the `Asia/Jerusalem` timezone to correctly respect DST shifts.
   - Replace fixed `DAY_MS` offsets in `getISOWeekMondayUTC` and `getWeekDates` with `addDays` or `addWeeks`.
   - Use `format` or `formatInTimeZone` for string output (like `YYYY-MM-DD`).
4. **Clean Up**:
   - Remove unused manual offset constants.

## Verification & Testing
- Run existing test suites (`npm run test`) to ensure schedule generation and week calculations pass.
- Manually create a new schedule arrangement via the backend or CLI testing script and inspect the database to verify that the shifts are initialized empty and their `startsAt` / `endsAt` boundaries perfectly align with the `ShiftDefinition` times.
