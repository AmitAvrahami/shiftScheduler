# Implementation Plan: Schedule Actions

## Objective
Update the `SchedulesPage.tsx` to include specific action buttons (View, Edit, Duplicate, Export) for each schedule, and ensure routing supports the `/schedules/:id/edit` path.

## Key Files & Context
- `frontend/src/pages/SchedulesPage.tsx`: Contains `ScheduleCard` which renders the actions.
- `frontend/src/App.tsx`: Contains the application routing.

## Implementation Steps
1. **Update `App.tsx` Routing**:
   - Add a new route for `/schedules/:weekId/edit` that renders the `<AdminDashboardPage />` component within a `<ProtectedRoute requiredRole="manager">`.

2. **Update `SchedulesPage.tsx`**:
   - Modify the `ScheduleCard` component to standardize the action buttons across different statuses (draft, published, etc.).
   - Add/ensure the following buttons are present and properly hooked up:
     - **View (Eye Icon)**: Navigates to `/schedules/:weekId`.
     - **Edit (Pencil Icon)**: Navigates to `/schedules/:weekId/edit`. This will be available for both 'Draft' and 'Published' statuses.
     - **Duplicate (Copy Icon)**: Calls the `onClone` prop.
     - **Export (File/Download Icon)**: Calls the `onExport` prop.
   - Update the parent `SchedulesPage` component to pass the correct navigation handlers (e.g., using `useNavigate`) to `ScheduleCard` for `onView` and the new `onEdit` props.

## Verification & Testing
- Start the frontend server and navigate to the schedules page.
- Verify that the action buttons appear for all schedules.
- Click "View" and ensure it navigates to `/schedules/:weekId`.
- Click "Edit" and ensure it navigates to `/schedules/:weekId/edit` and loads the editor component.
- Click "Duplicate" and "Export" and ensure their placeholder handlers are triggered.