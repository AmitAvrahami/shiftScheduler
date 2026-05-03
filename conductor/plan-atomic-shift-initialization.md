# Implementation Plan: Atomic Shift Initialization & BOLA Prevention

## Objective
Integrate the shift generation logic seamlessly into the weekly schedule creation process. When an admin initializes a week, they will instantly receive a "draft schedule" populated with the base empty shifts, executed within a strict atomic database transaction. Additionally, 'draft' schedules will be protected from Unauthorized/BOLA access.

## Background & Motivation
Currently, creating a schedule and generating the required shifts are separate steps. Combining them improves UX, but it introduces the risk of partial failures (e.g., the schedule is created but the shift generation fails, leaving a "ghost" week). Wrapping both steps in an atomic transaction ensures data integrity. Furthermore, we must strictly lock down who can view these 'draft' schedules to prevent BOLA vulnerabilities.

## Scope & Impact
1. **Backend - Controllers & Routes**:
   - `backend/src/controllers/adminController.ts`: Expose `POST /api/v1/admin/weeks/initialize`.
   - `backend/src/routes/admin.routes.ts`: Wire the endpoint.
   - `backend/src/controllers/scheduleController.ts`: Update `getScheduleById` and `getSchedules` to block non-admins from viewing schedules in the `'draft'` status. (As selected, BOLA logic stays in the controller to avoid coupling `authMiddleware` to the DB model).

2. **Backend - Services (Atomic Transactions)**:
   - Add a new transaction-aware initialization method. We will create a unified service function (e.g., `initializeWeeklySchedule` in `shiftGenerationService.ts` or a new service) that:
     - Starts a `mongoose.ClientSession` and transaction.
     - Creates the `WeeklySchedule` document.
     - Executes the existing `generateWeekShifts` logic, passing the session.
     - Commits on success, or aborts on failure to prevent ghost weeks.
   - Refactor `generateWeekShifts` internally to accept and use the `session` on DB operations like `Shift.insertMany`.

3. **Frontend Implementation**:
   - `frontend/src/lib/api.ts`: Add an API call to the new unified `/initialize` endpoint.
   - `frontend/src/pages/SchedulesPage.tsx`:
     - Update the "Create Draft" button logic to hit the new endpoint.
     - Handle `409 Conflict` specifically by surfacing the message: `"This draft has already been initialized."`
     - Navigate to `/admin` or `/schedules/:weekId` upon successful initialization so the admin can view the empty shift board.
     - Ensure the UI handles `assignments: []` gracefully without crashing.

## Phased Implementation Plan

### Phase 1: Backend Service Refactoring (Atomic Transaction)
- Update `shiftGenerationService.ts` (or `schedulerService.ts`) to include `initializeWeeklySchedule(weekId, generatedBy, actorId, ip)`.
- Use `mongoose.startSession()`.
- Ensure all DB reads/writes within this function pass `{ session }` in their query options.
- Handle rollback semantics cleanly on error.

### Phase 2: Backend Controllers & BOLA Protection
- Add `initializeWeek` handler in `adminController.ts`.
- In `scheduleController.ts`, update `getScheduleById`:
  - `if (schedule.status === 'draft' && req.user!.role !== 'admin') throw AppError(403)`
- In `scheduleController.ts`, update `getSchedules`:
  - Ensure the filter for non-admins actively excludes `'draft'` schedules. Currently, non-managers only see 'published'. Managers currently see all. This must be adjusted so managers cannot see 'draft'.

### Phase 3: Frontend Integration
- Modify `CreateModal` in `SchedulesPage.tsx` to replace `scheduleApi.create(weekId)` with the unified `adminApi.initialize(weekId)` when clicking "Create Draft".
- Update the `try/catch` block to handle a 409 status code and display the user-friendly idempotency message via `showToast`.
- Ensure successful navigation via `onNavigate()`.

## Verification & Testing
- **Transactions**: Artificially inject an error into the shift generation step and verify that the `WeeklySchedule` document is successfully rolled back and does not persist.
- **BOLA**: Authenticate as a standard employee and a manager, and attempt to fetch a `weekId` known to be in the 'draft' status. Ensure a 403 or 404 is returned.
- **Idempotency**: Click the 'Create Draft' button twice rapidly or retry on an existing draft, ensuring the exact string "This draft has already been initialized." appears.
