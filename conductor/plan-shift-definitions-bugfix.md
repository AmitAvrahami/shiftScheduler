# Implementation Plan: Fix Shift Definitions UI & Seeding

## Background & Motivation
When the manager attempts to create a new weekly schedule, the system requires active Shift Definitions (templates) to generate the empty shifts. If none exist, the API returns `ERR_NO_SHIFT_TEMPLATES` and redirects the user to the Shift Definitions management page. 
Currently, the user arrives at this page to find it empty. Furthermore, the "Add Shift" form has several bugs:
1. It is missing the required `requiredStaffCount` field.
2. It is missing the required `daysOfWeek` field (to select which days the shift runs).
3. It incorrectly references `coverageRequirements` which is not in the backend schema.

## Scope & Impact
- Modify `frontend/src/pages/AdminShiftDefinitionsPage.tsx` to match the exact `ShiftDefinition` Mongoose schema.
- Run the backend seed script to populate the default templates (Morning, Afternoon, Night) so the user does not have to build them manually.

## Proposed Solution

### Step 1: Update the Shift Definition Types and Form State
- In `AdminShiftDefinitionsPage.tsx`, update the `setForm` default state to replace `coverageRequirements` with `requiredStaffCount: 1` and `daysOfWeek: [0,1,2,3,4,5,6]`.

### Step 2: Add Missing Form Fields to the UI
- **Required Staff Count**: Add a number input mapped to `form.requiredStaffCount`.
- **Days of Week**: Add a group of 7 checkboxes (Sunday to Saturday) mapped to `form.daysOfWeek`.

### Step 3: Run the Seed Script
- Run `cd backend && npx ts-node src/scripts/seed.ts` to automatically populate the database with the predefined Morning, Afternoon, and Night shifts.

## Verification
- Load the Shift Definitions page and confirm the 3 seeded definitions appear.
- Test the "New Shift" button to ensure the checkboxes and staff count inputs work correctly.
- Navigate to "Schedules", click "Create new schedule", and verify that it no longer errors out and successfully generates the empty template shifts.