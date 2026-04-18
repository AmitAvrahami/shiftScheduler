# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShiftScheduler is a full-stack shift management application for managers and employees. Managers create weekly schedules using a CSP (Constraint Satisfaction Problem) algorithm; employees submit availability constraints.

## Tech Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Frontend   | React 19, Vite 8, TypeScript 6, Tailwind CSS 3         |
| Backend    | Node.js 22, Express 4, TypeScript 5, Mongoose 8        |
| Database   | MongoDB (Mongoose ODM)                                 |
| Auth       | JWT (jsonwebtoken), bcryptjs                           |
| Validation | Zod (backend)                                          |
| Monorepo   | npm workspaces (root `package.json`)                   |
| Linting    | ESLint 9 (flat config) + typescript-eslint, Prettier 3 |

## Architecture

```text
shiftScheduler/
├── backend/                Express REST API (port 5001)
│   └── src/
│       ├── config/         DB connection (Mongoose)
│       ├── controllers/    Route handlers
│       ├── middleware/     auth (JWT), error
│       ├── models/         Mongoose schemas
│       ├── routes/         Express routers
│       ├── services/       Business logic (CSP scheduler)
│       ├── types/          Express Request augmentations
│       └── utils/          AppError, weekUtils, helpers
├── frontend/               React SPA (port 5173)
│   └── src/
│       ├── components/     Shared UI components
│       ├── pages/          Route-level views
│       ├── hooks/          Custom React hooks
│       ├── lib/            API client, date/week utilities
│       ├── types/          TypeScript interfaces
│       └── assets/         Static assets
├── eslint.config.js        Root ESLint config (covers both workspaces)
├── .prettierrc             Root Prettier config
├── .env.example            All environment variables documented
└── CLAUDE.md               This file
```

## Commands

### Root (run both services)

```bash
npm run dev           # start backend :5001 + frontend :5173 concurrently
npm run build         # build both packages
npm run lint          # ESLint check (backend/src + frontend/src)
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier write
npm run format:check  # Prettier check (CI)
```

### Backend

```bash
npm run dev --workspace=backend    # ts-node-dev hot reload
npm run build --workspace=backend  # tsc → dist/
npm test --workspace=backend       # jest --runInBand
npm test --workspace=backend -- --testPathPatterns=<pattern>
```

### Frontend

```bash
npm run dev --workspace=frontend    # Vite dev server on port 5173
npm run build --workspace=frontend  # tsc + vite build
npm run lint --workspace=frontend
```

### Environment

Copy `.env.example` to `backend/.env` and fill in values:

- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — min 32 chars
- `ALLOWED_ORIGIN` — frontend origin (default `http://localhost:5173`)
- `PORT` — defaults to 5001

The Vite dev server proxies `/api/*` to backend port 5001 — no CORS config needed in development.

## Localization

| Setting     | Value                         |
| ----------- | ----------------------------- |
| Language    | Hebrew (`lang="he"`)          |
| Direction   | RTL (`dir="rtl"` on `<html>`) |
| Timezone    | `Asia/Jerusalem`              |
| Week start  | Sunday (index 0)              |
| Date format | `he-IL` locale via `Intl` API |

- All user-visible strings must be in proper Hebrew (not transliterated).
- Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Jerusalem'` for date/time display.
- Sunday is day 0 in all calendar and scheduling logic.
- Tailwind RTL utilities (`rtl:ml-4`, `rtl:text-right`, etc.) activate automatically
  because `dir="rtl"` is set on `<html>` in `frontend/index.html`.

## Code Style

- **Prettier**: `singleQuote`, `semi: true`, `trailingComma: 'es5'`, `printWidth: 100`.
- **ESLint**: `@typescript-eslint/recommended`, `react-hooks/rules-of-hooks`.
- Unused variables prefixed with `_` are allowed (`_req`, `_res`, `_next` in Express handlers).
- No `import React from 'react'` needed — React 19 JSX transform is configured.
- Backend uses `AppError` (`backend/src/utils/AppError.ts`) for all operational HTTP errors;
  never throw plain `Error` in route handlers.
- Zod schemas live next to the route/controller that uses them.

## Backend Architecture Detail

### Key Files

- **`server.ts`** — Express entry; mounts all routes under `/api/v1`, global error handler
- **`config/db.ts`** — Mongoose connection; reads `MONGODB_URI`
- **`routes/index.ts`** — Route aggregator
- **`middleware/authMiddleware.ts`** — JWT verification + role guards (`isManager`, `isAdmin`); attaches `req.user = { id, email, role }` where role ∈ `employee | manager | admin`
- **`middleware/errorMiddleware.ts`** — Handles `AppError` instances; falls back for generic errors
- **`utils/AppError.ts`** — Custom error class with `statusCode` and `isOperational` flag
- **`utils/weekUtils.ts`** — IST Sunday–Saturday week helpers; `getWeekDates()` creates LOCAL midnight dates
- **`services/schedulerService.ts`** + **`services/cspScheduler.ts`** — CSP engine with backtracking, MRV, LCV, forward checking, linear fairness penalties

### Timezone Convention (critical)

All date keys must use **local time**, not UTC:

```ts
// CORRECT
const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// WRONG — UTC offset causes off-by-one in IST (UTC+2)
const bad = d.toISOString().split('T')[0];
```

This applies in `schedulerService.ts`, `cspScheduler.ts`, and every frontend page that builds date keys.

### CSP Fairness Scoring

`calculateEmployeeScore()` in `cspScheduler.ts` uses linear penalties:

- +10 per total shift (load balance)
- +20 per night shift (concentration penalty)
- +30 for Friday+Saturday clustering (when >1 weekend shift)

Soft-cap warnings (non-blocking) fire when an employee gets >2 night shifts or both Fri+Sat.

### Auth Flow

JWT in `localStorage`. Role-based access: managers see schedule generation + constraint management; employees see their schedule and submit constraints.

## Testing

Tests live under `backend/src/__tests__/`. Run with `--runInBand` to avoid parallel DB conflicts.

- CSP integration tests use week **2026-W11**
- Stress tests use week **2026-W25**
- Use `--testPathPatterns` (plural, not singular)

## Git Conventions

- **Branching**: Use `feature/`, `fix/`, or `refactor/` prefixes.
- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Commands**: `git status`, `git add .`, `git commit -m "..."`.

