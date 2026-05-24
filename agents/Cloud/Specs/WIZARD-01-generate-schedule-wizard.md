# WIZARD-01 — Generate Schedule Wizard

## Goal

Replace the direct "ייצור סידור עבודה" button click with a polished 3-step wizard modal. The manager is guided through: selecting a week → reviewing constraints/readiness → confirming and triggering generation. This avoids accidental generation and surfaces readiness warnings before the action.

## Scope

- Frontend only: modal wizard component, one prop change in QuickActionsPanel, and additions to the existing `/admin` page.
- The `/admin` route renders `frontend/src/pages/AdminDashboardPage.tsx` — this is the file that was modified.
- The empty unused file `frontend/src/pages/admin/AdminDashboardPage.tsx` was not modified and must remain untouched.
- Reuse existing utilities: `getNextWeekId`, `getPrevWeekId`, `WeekLabel`, `LoadingButton`, `LoadingSpinner`, `adminApi.getDashboard`, `scheduleApi.generate`.
- Existing demo generation flow (`onGenerateDemo` / `isGeneratingDemo`) is unchanged.

## Out of Scope

- Backend changes, solver logic, API contract changes.
- Demo generation flow (stays as-is).
- KpiCards, ReadinessPanel, WeekHeader stubs (separate task).
- Drag-and-drop.

## Current Findings (at time of implementation)

- The `/admin` route renders `frontend/src/pages/AdminDashboardPage.tsx` (147 lines, already composed with all panels).
- `frontend/src/pages/admin/AdminDashboardPage.tsx` is an empty unused file — not modified.
- `QuickActionsPanel.tsx` had `onGenerate: () => Promise<GenerateResult | undefined>` and `isGenerating: boolean` props that called generation directly without a wizard.
- `PublishWarningsDialog.tsx` established the modal pattern: fixed backdrop, `dir="rtl"`, centered, ESC/backdrop close.
- `WeekLabel` at `frontend/src/components/WeekLabel.tsx` renders canonical "שבוע N · DD/MM/YYYY–DD/MM/YYYY".
- `getNextWeekId` / `getPrevWeekId` available in `frontend/src/utils/weekUtils.ts`.
- `useAdminDashboard.generateSchedule` is bound to the hook's weekId and does not accept a weekId parameter — so the parent page passes `scheduleApi.generate` directly to the wizard.

## Implementation Plan

### Step 1: Create `GenerateScheduleWizard.tsx`

File: `frontend/src/pages/admin/components/GenerateScheduleWizard.tsx`

Props:

```ts
interface GenerateScheduleWizardProps {
  open: boolean;
  initialWeekId: string;
  onClose: () => void;
  onGenerate: (weekId: string) => Promise<GenerateResult>;
  onGenerated: (result: GenerateResult) => void;
}
```

The wizard is UI-only. It calls `onGenerate(selectedWeekId)` — provided by the parent — and catches errors itself. The wizard never imports `scheduleApi` directly.

Local state: `step` (1|2|3), `selectedWeekId`, `reviewSummary`, `reviewLoading`, `reviewError`, `isGenerating`, `generateError`.

State resets when `open` transitions to `true`.

**Step 1 — בחירת שבוע ליצירת סידור:**

- `<WeekLabel weekId={selectedWeekId} />` + prev/next arrows via `getPrevWeekId`/`getNextWeekId`.
- "הבא" always enabled (initialWeekId pre-selected).
- Footer: [ביטול] | [הבא]

**Step 2 — בדיקת נתונים ואילוצים:**

- On entering step 2, call `adminApi.getDashboard(selectedWeekId)`, extract:
  ```ts
  {
    employeesCount: dto.employees.filter(e => e.isActive).length,
    missingConstraintsCount: dto.missingConstraints.length,
    warnings: dto.readiness.warnings,
    hasExistingSchedule: dto.scheduleId !== null,
  }
  ```
- `LoadingSpinner` while loading. On error: Hebrew message + retry button.
- Summary rows — all data-driven, no placeholder content.
- Footer: [הקודם] | [הבא] (הבא disabled while loading or on error)

**Step 3 — אישור יצירת סידור עבודה:**

- Confirmation card with selected week and action description.
- If `reviewSummary.hasExistingSchedule`: show warning "שים לב: קיים כבר סידור לשבוע זה. מומלץ לבדוק לפני יצירה מחדש."
- Generation flow: `await onGenerate(selectedWeekId)` in try/catch. On error: set `generateError`.
- `LoadingButton` (`isLoading={isGenerating}`, `loadingText="יוצר סידור..."`).
- While generating: disable back button, close button, ESC, backdrop.
- Footer: [הקודם (disabled if generating)] | [צור סידור עבודה]

**Modal shell:** `fixed inset-0 z-[110]`, rgba backdrop, `dir="rtl"`, `max-w-lg`. Step indicator: "שלב X מתוך 3".

### Step 2: Modify `QuickActionsPanel.tsx`

- Remove props: `onGenerate`, `isGenerating`.
- Add prop: `onOpenGenerateWizard: () => void`.
- "ייצור סידור עבודה" button: `onClick={onOpenGenerateWizard}`, no loading state.
- Remove `handleGenerate` function.
- `onGenerateDemo`/`isGeneratingDemo` remain unchanged.

### Step 3: Modify `frontend/src/pages/AdminDashboardPage.tsx`

- Add state: `wizardOpen`, `wizardResult`.
- Define `handleWizardGenerate = (wid: string) => scheduleApi.generate(wid)` — no try/catch, wizard handles errors.
- Pass `onOpenGenerateWizard={() => setWizardOpen(true)}` to `QuickActionsPanel` (remove `onGenerate`/`isGenerating`).
- Consolidate result display: `visibleResult = wizardResult ?? generateResult` covers both wizard and demo flows.
- Mount `<GenerateScheduleWizard>` with `onGenerated` callback that stores result, closes wizard, shows toast "לוח שיבוץ הופק בהצלחה!", and calls `refresh()`.

## Files to Inspect

- `frontend/src/pages/AdminDashboardPage.tsx` ✅ (the actual /admin page)
- `frontend/src/pages/admin/hooks/useAdminDashboard.ts` ✅
- `frontend/src/pages/admin/types.ts` ✅
- `frontend/src/pages/admin/components/QuickActionsPanel.tsx` ✅
- `frontend/src/pages/admin/components/PublishWarningsDialog.tsx` ✅
- `frontend/src/utils/weekUtils.ts` ✅
- `frontend/src/components/WeekLabel.tsx` ✅
- `frontend/src/components/ui/LoadingButton.tsx` ✅
- `frontend/src/pages/admin/utils/scheduleStats.ts` ✅

## Files to Change

| File                                                             | Change                                   |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `frontend/src/pages/admin/components/GenerateScheduleWizard.tsx` | **CREATE** — wizard modal                |
| `frontend/src/pages/admin/components/QuickActionsPanel.tsx`      | **MODIFY** — `onOpenGenerateWizard` prop |
| `frontend/src/pages/AdminDashboardPage.tsx`                      | **MODIFY** — wire wizard                 |
| `Agents/Cloud/Specs/WIZARD-01-generate-schedule-wizard.md`       | **UPDATE** — this spec                   |

**Not modified:** `frontend/src/pages/admin/AdminDashboardPage.tsx` (empty, unused).

## Guardrails

- No backend changes.
- No solver or API contract changes.
- All Hebrew text RTL-correct in source files.
- No fake/placeholder content in step 2 — only data from `adminApi.getDashboard`.
- Wizard must prevent duplicate clicks (button disabled while `isGenerating`).
- Wizard state is local — no global state.
- Do not duplicate week formatting logic — use `WeekLabel` and `weekUtils`.
- ESC and backdrop close only when not generating.

## Validation Checklist

- [x] TypeScript compiles without errors (`cd frontend && npx tsc --noEmit`)
- [x] Build succeeds (`npm run build`)
- [x] Lint passes with 0 errors (`npm run lint`)
- [x] Prettier passes (`npm run format:check`)
- [ ] Open `/admin` — dashboard renders without crash
- [ ] Click "ייצור סידור עבודה" — wizard modal opens
- [ ] Step 1: "הבא" is enabled immediately (current week preselected)
- [ ] Step 1: Prev/next arrows change the displayed week correctly
- [ ] Step 1: Selected week displays in "שבוע N · DD/MM/YYYY–DD/MM/YYYY" format
- [ ] Step 2: Readiness data loads and displays correctly
- [ ] Step 2/3: Back navigation preserves selected week
- [ ] Step 3: "צור סידור עבודה" button shows loading state and blocks duplicate clicks
- [ ] Step 3: Success shows toast, closes modal, refreshes dashboard
- [ ] Step 3: Error shows Hebrew message
- [ ] ESC and backdrop click close the modal (when not generating)

## Final Implementation Summary

### Files Changed

| File                                                             | Action                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `frontend/src/pages/admin/components/GenerateScheduleWizard.tsx` | Created — wizard modal                                                                              |
| `frontend/src/pages/admin/components/QuickActionsPanel.tsx`      | Modified — replaced `onGenerate`/`isGenerating` with `onOpenGenerateWizard`                         |
| `frontend/src/pages/AdminDashboardPage.tsx`                      | Modified — added wizard state, `handleWizardGenerate`, `wizardResult`, and `GenerateScheduleWizard` |
| `Agents/Cloud/Specs/WIZARD-01-generate-schedule-wizard.md`       | Updated — this spec                                                                                 |

### What Changed

- `GenerateScheduleWizard` is a self-contained modal with 3 steps: week selection (prev/next arrows + WeekLabel), readiness review (fetches `adminApi.getDashboard` on enter), and confirmation (calls `onGenerate(weekId)` from parent, catches errors locally).
- `QuickActionsPanel` "ייצור סידור עבודה" button now calls `onOpenGenerateWizard()` with no direct API call.
- `AdminDashboardPage` owns `handleWizardGenerate = (wid) => scheduleApi.generate(wid)` (no try/catch — wizard handles errors). After success, stores result in `wizardResult`, refreshes dashboard, shows toast.
- `visibleResult = wizardResult ?? generateResult` consolidates result display for both wizard and demo flows.
- Wizard resets all state when `open` transitions to `true`. ESC/backdrop disabled during generation.

### Validation Results

- TypeScript: passes clean (`npx tsc --noEmit`)
- Build: passes (`npm run build`)
- Lint: 0 errors, 6 pre-existing warnings in backend test files (unrelated)
- Prettier: passes (`npm run format:check`)

### Not Manually Tested (requires running app)

- Step 2 readiness data loading in a live environment with real weekId
- Existing-schedule warning visibility (requires a week with `scheduleId`)
- ESC/backdrop close behavior
- Full generation flow end-to-end

### Follow-up Recommendations

- Add a week range limit (e.g. prevent selecting more than 8 weeks in the past/future) if UX requires it.
- Consider auto-dismissing the toast after 3 seconds (currently requires manual close).
- KpiCards, ReadinessPanel, WeekHeader stubs remain empty — implement as a separate task.
