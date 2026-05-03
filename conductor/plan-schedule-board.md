# Implementation Plan: Schedule Board UI

## Background & Motivation
Currently, when a user clicks to view or edit a schedule from the Schedules list (`/schedules`), they are navigated to the `AdminDashboardPage`. This page only displays a high-level summary of the *current day's* shifts. To effectively manage a schedule, the manager needs a full 7-day grid view displaying all generated shifts for the selected week.

## Scope & Impact
1.  **New Page**: Create `frontend/src/pages/ScheduleBoardPage.tsx`.
2.  **Routing Update**: Modify `frontend/src/App.tsx` to route `/schedules/:weekId` and `/schedules/:weekId/edit` to the new `ScheduleBoardPage`.
3.  **API Integration**: Ensure the new page correctly fetches all shifts and assignments for the specified `weekId` and displays them in a weekly grid.

## Proposed Solution

### Step 1: Create `ScheduleBoardPage.tsx`
- Create a new component that uses `useParams` to get the `weekId`.
- Fetch the `schedule`, `shifts`, and `assignments` using existing API endpoints (or the comprehensive `adminApi.getDashboard(weekId)` which already fetches this data efficiently).
- Render a 7-day grid (Sunday - Saturday).
- For each day, display the shifts (Morning, Afternoon, Night) based on the shift definitions.
- Show the current assignments for each shift and provide empty slots if the `requiredStaffCount` is not met.

### Step 2: Update Application Routing
- In `frontend/src/App.tsx`, import `ScheduleBoardPage`.
- Update the routes for `/schedules/:weekId` and `/schedules/:weekId/edit` to render `<ScheduleBoardPage />` instead of `<AdminDashboardPage />`.

### Step 3: Enhance the Grid UI
- Implement drag-and-drop or simple click-to-assign functionality for the empty slots (this can be a basic "Select Employee" dropdown initially, to be enhanced later).
- Add a "Publish" button to change the schedule status from `draft` to `published`.

## Verification
- Navigate to `/schedules` and click "View" on any existing schedule.
- Verify the app transitions to the new `ScheduleBoardPage` and renders a 7-day grid.
- Confirm that the correct shifts for that specific `weekId` are displayed.