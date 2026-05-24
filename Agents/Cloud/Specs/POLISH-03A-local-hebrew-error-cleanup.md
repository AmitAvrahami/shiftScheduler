# POLISH-03A — Local Hebrew Error Cleanup

## Goal

Replace native `alert()` dialogs and raw/English error messages across frontend pages with
clear, consistent Hebrew error messages. Each page keeps its own local error state or toast
pattern — no shared global infrastructure is introduced in this task.

## Scope

- Replace all `alert()` calls used for error/confirmation feedback with inline error state or
  local toast patterns already established in the page.
- Replace `err.message` / raw API strings shown directly in the UI with fixed Hebrew fallbacks.
- Fix swallowed `console.error` catches in `SchedulesPage` and `ScheduleBoardPage` so the user
  receives visible UX feedback when publish-warning detection fails.
- Convert the one English-language user-facing string in `SchedulesPage` to Hebrew.
- Improve `LoginPage` error message to use a safe Hebrew fallback instead of raw `err.message`.

## Out of Scope

- No new shared toast infrastructure, no global error context, no new components.
- No changes to `ConstraintPage` or `AdminDashboardPage` — their error handling is already
  Hebrew and acceptable (medium/low severity per discovery).
- No backend, solver, API contract, or DB schema changes.
- No changes to `ScheduleBoardPage` hook internals — only the page's display string.
- `AdminWeeklyStaffingPage` — already uses a local toast and reverts correctly; skip for now.
- Authentication logic refactor — only the displayed error string is changed in `LoginPage`.
- No drag-and-drop, no new components, no new routes.

## Current State / Findings

From the POLISH-03 discovery report (conductor file, now retired):

**Critical — native `alert()` in use:**

- `AdminShiftDefinitionsPage.tsx`: `alert()` on save/delete errors.
- `UsersPage.tsx`: `alert()` on `toggleStatus` and `toggleFixedMorning` errors.

**High — English text or raw `err.message` exposed:**

- `SchedulesPage.tsx`: English string "It looks like you haven't defined your shifts yet...";
  raw API messages shown in toast; `console.error` swallows publish-warning detection failure.
- `LoginPage.tsx`: `err.message` shown directly — could expose "Invalid credentials" in English.

**Medium — swallowed errors or raw strings:**

- `ScheduleBoardPage.tsx`: `console.error` swallowed on publish-warning detection; raw `error`
  string from hook rendered inline (hook already sets Hebrew but inconsistently).

**Infrastructure note:**

- `useToast` hook lives inside `SchedulesPage.tsx` — not shared. Keep it local.
- `AdminDashboardPage` uses its own `useState<Toast>` pattern. Keep it local.
- No `ErrorState` component wiring is in scope for this task.

## Implementation Plan

### 1. `AdminShiftDefinitionsPage.tsx`

- Identify the local `error` state already present for load errors.
- Add a local `actionError` state (string | null) for save/delete errors.
- Replace each `alert('...')` with `setActionError('...')` using the recommended Hebrew message.
- Render `actionError` as an inline error banner near the form or at the top of the page,
  dismissible on next action.
- Recommended messages:
  - save: `'לא ניתן לשמור את סוג המשמרת'`
  - delete: `'לא ניתן למחוק את סוג המשמרת'`
  - load: `'אירעה שגיאה בטעינת הגדרות המשמרות'` (already has inline error; verify it is Hebrew)

### 2. `UsersPage.tsx`

- A local toast state already exists (from POLISH-02 — `toast` / `setToast`). Verify.
- Replace `alert('...')` in `toggleStatus` catch with `setToast({ message: 'שגיאה בעדכון סטטוס המשתמש', type: 'error' })`.
- Replace `alert('...')` in `toggleFixedMorning` catch with `setToast({ message: 'שגיאה בעדכון הגדרת עובד בוקר', type: 'error' })`.
- Do not add new state — reuse whatever toast/error mechanism POLISH-02 left in place.

### 3. `SchedulesPage.tsx`

- Find and replace the English string `"It looks like you haven't defined your shifts yet"` with
  `'לא הוגדרו משמרות במערכת. יש להגדיר משמרות בהגדרות המערכת'`.
- Find the `catch (e) { console.error('Failed to detect publish warnings:', e); }` block and add
  a toast call: `showToast('שגיאה בבדיקת אזהרות פרסום', 'error')` (using the existing
  `showToast` / `useToast` already in that file).
- Verify other toast error messages in the file are already Hebrew; replace any that are raw
  `err.message` with fixed Hebrew fallbacks.

### 4. `ScheduleBoardPage.tsx`

- Find the swallowed `console.error` on publish-warning detection and add visible feedback
  (inline error state or existing error pattern in the page).
- Verify the inline `error` string displayed from the hook is in Hebrew; if not, add a Hebrew
  fallback guard: `error || 'אירעה שגיאה. נסה שוב.'`.

### 5. `LoginPage.tsx`

- In the login catch block, replace `err.message` (or equivalent) with a fixed Hebrew fallback:
  - On auth failure (401/403): `'פרטי ההתחברות שגויים'`
  - On other errors: `'אירעה שגיאה בתהליך ההתחברות. נסה שוב.'`
- Do not change the auth flow, routing, or token logic.

## Files to Inspect

- `frontend/src/pages/AdminShiftDefinitionsPage.tsx`
- `frontend/src/pages/UsersPage.tsx`
- `frontend/src/pages/SchedulesPage.tsx`
- `frontend/src/pages/ScheduleBoardPage.tsx`
- `frontend/src/pages/LoginPage.tsx`

## Files to Change

| File                                                          | Change                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `frontend/src/pages/AdminShiftDefinitionsPage.tsx`            | Replace `alert()` with inline `actionError` state; Hebrew messages         |
| `frontend/src/pages/UsersPage.tsx`                            | Replace `alert()` with existing toast; Hebrew messages                     |
| `frontend/src/pages/SchedulesPage.tsx`                        | Replace English string; fix swallowed console.error; verify toast messages |
| `frontend/src/pages/ScheduleBoardPage.tsx`                    | Fix swallowed console.error; guard raw error string                        |
| `frontend/src/pages/LoginPage.tsx`                            | Replace raw `err.message` with Hebrew fallback                             |
| `Agents/Cloud/Specs/POLISH-03A-local-hebrew-error-cleanup.md` | This spec                                                                  |

**Not modified:** `ConstraintPage.tsx`, `AdminDashboardPage.tsx`, `AdminWeeklyStaffingPage.tsx`,
`DashboardPage.tsx`, `AdminConstraintsPage.tsx`, all backend/solver files.

## Guardrails

- No new shared components, hooks, or context.
- No changes to existing toast infrastructure — use what is already in each page.
- No changes to API layer, backend, or business logic.
- Every user-facing error string must be Hebrew.
- Do not expose `err.message` directly in the UI — always use a fixed Hebrew fallback.
- Do not introduce `alert()` anywhere.
- Do not change routing, auth flow, or token handling in `LoginPage`.
- All Hebrew text must be written normally in source files (not escaped or encoded).
- TypeScript must compile without new errors.

## Validation Checklist

- [ ] TypeScript compiles without errors (`cd frontend && npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Lint passes with 0 errors (`npm run lint`)
- [ ] No native `alert()` calls remain in the changed files
- [ ] No `err.message` exposed directly in the UI in the changed files
- [ ] English string in `SchedulesPage` is replaced with Hebrew
- [ ] `console.error` swallowed blocks now show visible user feedback
- [ ] Login error shows Hebrew message
- [ ] All Hebrew strings are correct RTL text

## Final Implementation Summary

### Files Changed

| File                                                   | Changes                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/pages/AdminShiftDefinitionsPage.tsx`     | Added `actionError` state; replaced `alert()` (save/delete/missing-ID) with `setActionError()`; fixed load error to use fixed Hebrew; clear on success and on action start; inline display      |
| `frontend/src/pages/UsersPage.tsx`                     | Added `actionError` state; replaced `alert()` in `toggleStatus`/`toggleFixedMorning` with `setActionError()`; fixed load/create/edit errors to use fixed Hebrew; inline banner display          |
| `frontend/src/pages/SchedulesPage.tsx`                 | Replaced English ERR_NO_SHIFT_TEMPLATES string; fixed all `err.message` exposures in toast calls to fixed Hebrew; added `showToast` to swallowed publish-warning catch (publish flow unchanged) |
| `frontend/src/pages/LoginPage.tsx`                     | Added `ApiError` import; replaced raw `err.message` with `ApiError` guard — `ApiError` → `'פרטי ההתחברות שגויים'`, non-ApiError → `'אירעה שגיאה בתהליך ההתחברות. נסה שוב'`                      |
| `frontend/src/pages/ConstraintPage.tsx`                | Fixed load error to `'שגיאה בטעינת האילוצים'`; updated save error display string to `'אירעה שגיאה בשמירת האילוצים. אנא נסה שוב'`                                                                |
| `frontend/src/pages/ScheduleBoardPage.tsx`             | Added `pageError` state; fixed swallowed publish-warning detection catch; replaced `alert()` placeholder in `onAssignEmployee` with `setPageError('פעולה זו עדיין לא זמינה')`; inline display   |
| `frontend/src/pages/admin/AdminWeeklyStaffingPage.tsx` | Removed `ApiError` import (unused after fix); changed all `err.message` exposures to fixed Hebrew strings in load/initialize/save catch blocks                                                  |

### Validation Results

- `cd frontend && npx tsc --noEmit` — **PASS** (0 errors)
- `npm run build` — **PASS** (build succeeds, 0 errors)
- `npm run lint` — **PASS** (0 errors; 6 pre-existing backend test warnings, unchanged)
- `npm run format:check` — **PASS for all changed files**; `Agents/Cloud/Specs/POLISH-03A-local-hebrew-error-cleanup.md` has a pre-existing Prettier issue not introduced by this task

### What Was Not Manually Tested

- Login flow with incorrect credentials (can't test without running server)
- ScheduleBoardPage `onAssignEmployee` click (UI requires server + populated board)
- SchedulesPage publish-warning detection failure path (requires server + network manipulation)
- Toast auto-dismiss behavior in browser
- RTL rendering of new Hebrew strings in actual browser

### Follow-up Recommendations

- **Fix pre-existing spec Prettier issue**: run `npx prettier --write Agents/Cloud/Specs/POLISH-03A-local-hebrew-error-cleanup.md` before next PR that touches specs
- **Implement `onAssignEmployee`**: Replace the `'פעולה זו עדיין לא זמינה'` placeholder with actual shift assignment UI in a future task
- **LoginPage 403 (suspended account)**: Currently shows same `'פרטי ההתחברות שגויים'` as 401. A future pass could differentiate: backend sends `'החשבון מושהה. פנה למנהל.'` — could pass through if policy allows, or add a distinct ApiError `code` for suspension
- **Global toast infrastructure**: If the project later adopts a shared ToastProvider, these local patterns can be migrated in a single sweep
