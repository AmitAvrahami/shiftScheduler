# POLISH-05 — Admin Dashboard MVP Polish

## Goal

Polish three rough edges on the Admin Dashboard so it feels production-ready and
aligned with the real CSP scheduling flow:

1. Remove the leftover "demo schedule" generator button that predates the real
   generate flow.
2. Make the "Recent Activity" (פעילות אחרונה) panel show the latest 5 entries by
   default with an in-panel expand/collapse toggle, and never leak raw English
   action codes to the manager.
3. Make the weekly `ScheduleBoard` fluid so it does not force horizontal scroll on
   normal desktop widths (notably the 2/3-width dashboard column).

## Scope

- `QuickActionsPanel`: remove the `generate-demo` action button + its props.
- `AdminDashboardPage`: stop passing demo props; drop now-unused destructured values.
- `AuditLogPanel`: latest-5 default, expand/collapse toggle reusing the existing
  "צפה בהכל" header button (collapsed: "צפה בהכל", expanded: "הצג פחות"); hide the
  toggle when ≤5 logs; safe Hebrew fallback for unmapped action codes.
- `ScheduleBoard`: remove `min-w-[1120px]` and the fixed `minmax(132px,1fr)` day-column
  floor; use fluid `minmax(0,1fr)` day columns. Affects both usages
  (AdminDashboardPage preview + ScheduleBoardPage).

## Out of Scope

- Deleting backend demo endpoints/services (`scheduleApi.generateDemo`, backend route).
  The frontend hook wrapper `generateDemoSchedule` stays (live backend endpoint).
- Any new route/page/API for "view all activity".
- The real CSP generate/publish flows — must keep working untouched.
- DTO / API-shape / business-logic / CSP changes.

## Current Findings

- `QuickActionsPanel.tsx`: the `generate-demo` action is the only consumer of
  `onGenerateDemo` / `isGeneratingDemo`, and the only thing using the `isLoading`
  spinner branch in the button renderer.
- `useAdminDashboard.ts`: `actions.generateDemoSchedule` + `actionLoading.generatingDemo`
  are used only by AdminDashboardPage → QuickActionsPanel. Backend endpoint stays, so
  the hook method is left in place.
- `AuditLogPanel.tsx`: header button "צפה בהכל" is dead (no onClick). Renders the full
  `logs` list. Unmapped codes fall back to the raw English `entry.action`.
- `ScheduleBoard.tsx`: wraps the grid in `overflow-x-auto` > `min-w-[1120px]`; both the
  header row and body rows use `grid-cols-[120px_repeat(7,minmax(132px,1fr))]` →
  ~1044px hard floor forces scroll inside the dashboard's 2/3 column. Cells already
  truncate (ShiftCell).

## Implementation Plan

1. `QuickActionsPanel.tsx`: remove the `generate-demo` entry from `actions`, the
   `onGenerateDemo`/`isGeneratingDemo` props, `handleGenerateDemo`, and the demo-only
   `isLoading` spinner branch in the button renderer.
2. `AdminDashboardPage.tsx`: remove `onGenerateDemo`/`isGeneratingDemo` props on
   `<QuickActionsPanel>`; drop `actionLoading` from the destructure (now unused).
3. `AuditLogPanel.tsx`: add `expanded` state; `visibleLogs = expanded ? logs : logs.slice(0,5)`;
   render the header toggle only when `!loading && logs.length > 5` with text
   `expanded ? 'הצג פחות' : 'צפה בהכל'`; map over `visibleLogs`; fallback label
   `ACTION_LABELS[entry.action] ?? 'פעולה במערכת'`.
4. `ScheduleBoard.tsx`: remove the `min-w-[1120px]` wrapper div; change both grid
   templates to `grid-cols-[120px_repeat(7,minmax(0,1fr))]`. Keep `overflow-x-auto` as
   harmless small-screen safety and keep `dir="rtl"`.

## Files to Inspect

- frontend/src/pages/admin/components/QuickActionsPanel.tsx
- frontend/src/pages/AdminDashboardPage.tsx
- frontend/src/pages/admin/components/AuditLogPanel.tsx
- frontend/src/pages/admin/components/ScheduleBoard.tsx
- frontend/src/pages/ScheduleBoardPage.tsx (second ScheduleBoard usage)
- frontend/src/pages/admin/hooks/useAdminDashboard.ts

## Files to Change

- frontend/src/pages/admin/components/QuickActionsPanel.tsx
- frontend/src/pages/AdminDashboardPage.tsx
- frontend/src/pages/admin/components/AuditLogPanel.tsx
- frontend/src/pages/admin/components/ScheduleBoard.tsx

## Guardrails

- Remove the demo button from the dashboard UI only; do not touch backend demo
  endpoints/services or the real generate/publish flows.
- No English strings visible to the manager; use a safe Hebrew fallback for unmapped
  audit codes.
- Recent Activity: default 5; toggle hidden when ≤5; expanded shows all already-loaded
  logs (no new fetch). Keep loading/empty/error behavior.
- ScheduleBoard: preserve RTL and in-cell truncation/ellipsis; avoid horizontal scroll
  on normal desktop widths; mobile/tablet may still scroll if truly necessary.
- Preserve existing Hebrew copy, styling, and behavior elsewhere.

## Validation Checklist

- [x] TypeScript compiles without errors (`cd frontend && npx tsc --noEmit`)
- [x] Prettier passes (changed files re-formatted; `prettier --check` clean)
- [x] ESLint passes (`npm run lint` — 0 errors; 6 pre-existing backend test unused-var warnings)
- [x] Build succeeds (`cd frontend && npm run build`)
- [x] UI behavior matches intent (RTL/Hebrew intact)

## Final Implementation Summary

- **QuickActionsPanel**: removed the `generate-demo` action and its `onGenerateDemo` /
  `isGeneratingDemo` props + `handleGenerateDemo`. The button renderer's demo-only
  `isLoading` spinner branch was removed (no quick action loads anymore). The remaining
  four actions (generate wizard, view weekly, approve leaves, emergency shift) are
  unchanged.
- **AdminDashboardPage**: dropped the demo props on `<QuickActionsPanel>` and the
  now-unused `actions` / `actionLoading` from the `useAdminDashboard` destructure. The
  real generate flow (wizard → `scheduleApi.generate`) is untouched.
- **AuditLogPanel**: shows latest 5 by default; the previously-dead "צפה בהכל" header
  button is now an expand/collapse toggle (`הצג פחות` when expanded), rendered only when
  there are >5 loaded logs. Expanding shows all already-loaded logs (no new fetch).
  Unmapped action codes now fall back to Hebrew `פעולה במערכת` instead of the raw English
  code. Loading skeleton / empty / row styling unchanged.
- **ScheduleBoard**: removed the `min-w-[1120px]` wrapper and the fixed
  `minmax(132px,1fr)` day-column floor; columns are now
  `[minmax(84px,110px)_repeat(7,minmax(0,1fr))]`, so the board fills its container and no
  longer forces horizontal scroll in the dashboard's 2/3 column. `overflow-x-auto` and
  `dir="rtl"` are kept; ShiftCell truncation is preserved. Applies to both usages
  (AdminDashboardPage preview + ScheduleBoardPage).

Decisions / notes:
- Backend demo endpoint (`scheduleApi.generateDemo`) and the hook wrapper
  `generateDemoSchedule` were intentionally left in place — only the dashboard UI button
  was removed, per scope.
- Fluid columns mean very narrow mobile widths compress rather than scroll; acceptable per
  the agreed guardrail (mobile may scroll only if truly necessary).

## Follow-up — Compact ScheduleBoard variant (POLISH-05b)

A manual browser check after the initial fluid change showed the dashboard board still
scrolled horizontally and felt too heavy as a preview. Root cause: the grid-item wrappers
in `ScheduleBoard.tsx` lacked `min-w-0`, so each `ShiftCell`'s intrinsic content width
overflowed the `minmax(0,1fr)` tracks and inflated the `overflow-x-auto` container's
`scrollWidth`. The dashboard also only needs a readable preview, not full editing density.

Changes:

- **ScheduleBoard**: added a `variant?: 'full' | 'compact'` prop (default `'full'`).
  `min-w-0` is now applied to the cell wrappers and `ShiftRowHeader` in **both** variants
  (the actual scroll fix). Density is selected via complete static class strings (so
  Tailwind's scanner emits them): compact uses a narrower label column
  (`minmax(48px,64px)` vs `minmax(84px,110px)`), tighter header padding/text, and `p-1`
  cell wrappers. `ShiftRowHeader` in compact uses `px-2 py-2`, `text-xs`, and hides the
  "שורת משמרת" subtitle.
- **ShiftCell**: added the same `variant` prop; compact reduces `min-h`/padding, header gap,
  label/sub text sizes, status-badge size, employee-row padding, and the empty/"חסר עובד"
  states. Added `min-w-0` + `truncate` on the label block and `shrink-0` on the status badge
  so content can never force overflow. Behavior (warnings, colors, handlers, RTL) unchanged.
- **AdminDashboardPage**: passes `variant="compact"`.
- **ScheduleBoardPage**: unchanged — omits the prop, so it stays on `'full'` density.

Validation: `tsc --noEmit` clean, ESLint 0 errors, Prettier clean, frontend build succeeds.
Manual browser check of the dashboard (no horizontal scroll) and the full page (no
regression) still required by the user.
