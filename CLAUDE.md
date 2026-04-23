# CLAUDE.md — ShiftScheduler

## 🛠 Project Overview

Automated CSP-based shift management for 24/7 control rooms (IST Timezone).

- **Stack:** React 19, Vite, TS, Node.js 22, Express, MongoDB (Mongoose), Tailwind (RTL).
- **Monorepo:** `backend/` (:5001), `frontend/` (:5173).

## 🌍 Timezone & Localization (CRITICAL)

- **Timezone:** IST (UTC+3) / `Asia/Jerusalem`.
- **Date Logic:** Use LOCAL dates only. **Forbidden:** `toISOString()` for date keys (causes off-by-one).
- **Format:** `YYYY-MM-DD` via `local-time` keys.
- **UI:** Hebrew (`lang="he"`), RTL, Week starts Sunday (0).

## 💻 Commands

- **Dev:** `npm run dev` (root) | **Lint:** `npm run lint` | **Format:** `npm run format`.
- **Test:** `npm test --workspace=backend` (use `--runInBand`).

## 📋 Git & Workflow Instructions

Follow these steps for any version control task:

1. **Assess:** Run `git status` and `git log`.
2. **Thinking:** Open `<thinking>` tag to plan:
   - Branching (`feature/`, `fix/`, `refactor/`).
   - Atomic commits (no massive lumps).
   - Use Git Worktrees if managing parallel tasks.
3. **Draft:** Prepare Conventional Commits and PR summary.
4. **Approval:** Present the plan and **WAIT FOR APPROVAL** before execution.

## 🏗 Coding Standards

- **Errors:** Backend must use `AppError`. Never throw plain `Error`.
- **Validation:** Zod schemas next to controllers/routes.
- **Styles:** Prettier (SingleQuote, Semi), ESLint (Flat config).
- **CSP:** Core logic in `backend/src/services/cspScheduler.ts`.

## ⚖️ MVP & Docs

- **In Scope:** Auth, CSP Engine, Drag-and-Drop, Workflow Deadlines, Audit Log.
- **Out of Scope:** Shift swaps, PDF/Excel, Mobile app, Multi-tenancy.
- **Docs Ref:** `docs/` (`DOMAIN_MODEL`, `CSP_ALGORITHM`, `CONSTRAINTS`, `WEEKLY_FLOW`).

## 📝 Example Commit

`feat(constraints): enforce Monday 23:59 deadline via middleware`
