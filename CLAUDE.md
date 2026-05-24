# CLAUDE.md — ShiftScheduler

## 🛠 Project Overview

ShiftScheduler is an automated CSP-based shift management system for 24/7 control-room environments.

- Stack: React, Vite, TypeScript, Node.js, Express, MongoDB/Mongoose, Tailwind CSS with Hebrew RTL.
- Monorepo:
  - `backend/` runs on port 5001
  - `frontend/` runs on port 5173

---

## 📁 Agent Workspace

```
Agents/
  Cloud/
    Specs/    ← Claude Code task specs (one file per task)
  Codex/      ← Reserved for Codex-specific files
```

**Never delete or rename these directories.**

---

## 📋 Task Spec Workflow — MANDATORY

For every non-trivial task, before writing any code:

### 1. Create a spec file

Create a Markdown file under `Agents/Cloud/Specs/` using this naming convention:

```
<TASK-ID>-<short-task-name>.md
```

Examples:

- `POLISH-02-global-loading-states.md`
- `POLISH-03-hebrew-user-facing-errors.md`
- `BUG-fix-admin-constraints-null-id-crash.md`

### 2. Spec file structure

Every spec must include all of the following sections:

```markdown
# <TASK-ID> — <Task Title>

## Goal

What this task accomplishes and why.

## Scope

What is included in this task.

## Out of Scope

What is explicitly excluded.

## Current Findings

What was discovered by reading the codebase before planning.

## Implementation Plan

Step-by-step ordered plan. Be specific.

## Files to Inspect

List of files to read before coding.

## Files to Change

List of files that will be modified or created.

## Guardrails

Constraints and rules that must not be violated.

## Validation Checklist

- [ ] TypeScript compiles without errors
- [ ] Prettier passes
- [ ] ESLint passes
- [ ] Build succeeds
- [ ] Tests pass (if backend changed)
- [ ] UI behavior matches original (if frontend changed)

## Final Implementation Summary

(Filled in after the task is complete — what was done, what decisions were made, what was left out.)
```

### 3. Plan mode protocol

In plan mode:

1. Read the task.
2. Inspect relevant files.
3. Create or update the spec file.
4. Present the plan to the user.
5. Wait for explicit approval.
6. Implement only after approval.
7. Update the spec file with the Final Implementation Summary once done.

### 4. Spec file is source of truth

- If the task changes mid-implementation, update the spec file before continuing.
- The spec file takes precedence over any informal in-conversation plan.
- One spec file per task. Do not reuse a spec for a different task.

---

## 🌍 Timezone & Localization — Critical

- Timezone: `Asia/Jerusalem`
- Week starts on Sunday.
- UI language: Hebrew.
- UI direction: RTL.
- Date logic must use local dates.
- Do not use `toISOString()` for local date keys because it can cause off-by-one day bugs.
- Prefer explicit local date helpers for `YYYY-MM-DD`.

---

## 🔄 Weekly Lifecycle

The weekly schedule workflow is a state machine:

```txt
open -> locked -> generating -> draft -> published -> archived
```

Meaning:

- `open`: employees can submit constraints.
- `locked`: constraints are fixed.
- `generating`: CSP solver is running.
- `draft`: schedule exists and manager can review/edit.
- `published`: employees can view assigned shifts.
- `archived`: historical read-only schedule.

Do not introduce new workflow states without explicit approval.

---

## 🏗 Architecture Rules

General ownership:

```
Page = composition only
Hook = logic and API orchestration
Components = presentation/UI only
Utils = pure reusable helpers
Types = contracts
```

Rules:

- Pages should not contain large inline rendering blocks.
- Pages should not contain API calls when a hook already owns that flow.
- Components should not call APIs directly.
- Components should not own business workflow state.
- Hooks may call APIs and own async state.
- Utils must be pure and side-effect free.
- Types should be explicit and reused where possible.

---

## 🧩 Admin Dashboard Refactor Rules

`AdminDashboardPage.tsx` is being decomposed gradually.

Already extracted components may include:

- `QuickActionsPanel`
- `DashboardSummaryPanel`
- `MissingConstraintsPanel`
- `GeneratedSchedulePanel`
- `ShiftCard`

When refactoring admin dashboard:

- Extract one component or panel per PR.
- Preserve existing behavior and styling.
- Do not redesign UI during extraction.
- Do not change backend, DTOs, API layer, hooks, or business logic.
- Do not add drag-and-drop unless the task explicitly asks for it.
- Do not introduce memoization/performance optimizations unless required to preserve behavior.
- Avoid dependency cycles.
- Prefer named exports.
- Co-locate component-specific prop types with the component.
- Move helpers to `frontend/src/pages/admin/utils/` only if reused by more than one component.
- Keep `AdminDashboardPage.tsx` as a composition layer.

Recommended extraction order:

```
1. ShiftOverviewPanel
2. AuditLogPanel
3. BroadcastCenterPanel
4. Week/date helper cleanup
5. Final AdminDashboardPage cleanup
```

---

## 📏 File Size Guidance

Do not treat line count as a hard rule.

Preferred target:

- Most components: under ~200 lines.
- Complex composition pages may exceed 200 lines if they remain readable and composition-only.
- Extract when cognitive complexity is high, not just because of line count.

Extract when a file has:

- multiple responsibilities
- large inline JSX sections
- mixed API/business/UI logic
- repeated helpers
- hard-to-review diffs

---

## 💻 Commands

Common commands:

```
npm run dev
npm run lint
npm run format
npm run format:check
npm run build
npm test --workspace=backend -- --runInBand
```

Frontend validation for UI refactors:

```
cd frontend
npx tsc --noEmit
npm run build
```

Root validation before PR:

```
npm run format
npm run format:check
npm run lint
npm run build
```

If a validation command fails:

- Fix only issues caused by the current change.
- Do not fix unrelated pre-existing warnings or errors unless explicitly asked.
- Report pre-existing issues separately.

---

## 📋 Git Workflow

For every version-control task:

1. Start from latest `main`.
2. Run:

```
git status
git pull origin main
```

3. Create a dedicated branch:

```
git checkout -b refactor/<short-name>
```

4. Make one atomic change.
5. Run validation.
6. Commit with Conventional Commit format.
7. Push the branch.
8. Open a GitHub PR.
9. Stop after opening the PR and report:

- branch name
- PR URL
- files changed
- validation results
- risks/follow-ups

Do not continue to the next task until the current PR is merged into `main`.

---

## 🔀 PR Rules

One PR should contain one concern only.

Good PR examples:

```
refactor(admin): extract shift overview panel
refactor(admin): extract audit log panel
fix(admin): resolve dashboard publish loading state
feat(constraints): enforce deadline lock
```

Avoid:

```
refactor dashboard and fix bugs and update styles
```

PR description should include:

```
## Summary

## Scope

## Validation

## Out of Scope

## Risks / Follow-ups
```

---

## 🧪 Testing & Formatting Rules

Before pushing a PR, always run:

```
npm run format
npm run format:check
npm run lint
npx tsc --noEmit
npm run build
```

For backend changes also run:

```
npm test --workspace=backend -- --runInBand
```

Prettier failures must be fixed before opening a PR.

---

## 🧱 Backend Coding Standards

- Backend errors must use `AppError`.
- Do not throw plain `Error` for expected application errors.
- Validation should use Zod schemas near controllers/routes.
- CSP core logic belongs in:

```
backend/src/services/cspScheduler.ts
```

- Keep controller logic thin.
- Keep service logic testable.

---

## ⚖️ MVP Boundaries

In scope:

- Auth
- CSP engine
- Manager schedule workflow
- Constraint submission and locking
- Audit log
- Admin dashboard decomposition
- Drag-and-drop only when explicitly requested

Out of scope unless explicitly requested:

- Shift swaps
- PDF/Excel export
- Mobile app
- Multi-tenancy
- Holiday engine
- Advanced analytics

---

## 📚 Docs

Before changing domain behavior, inspect relevant docs in `docs/`, especially:

- `DOMAIN_MODEL`
- `CSP_ALGORITHM`
- `CONSTRAINTS`
- `WEEKLY_FLOW`

Do not change domain behavior based only on assumptions.

---

## 📝 Commit Message Examples

```
refactor(admin): extract shift overview panel
refactor(admin): extract broadcast center panel
fix(admin): preserve schedule result when refreshing dashboard
feat(constraints): enforce Monday deadline lock
test(schedules): cover template shift materialization
```
