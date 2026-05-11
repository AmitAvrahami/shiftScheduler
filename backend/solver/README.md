# Solver Service (FastAPI + OR-Tools CP-SAT)

Python FastAPI service that runs the CP-SAT shift-assignment model. The Node
backend in `backend/src/` calls this service over HTTP through the
`SOLVER_URL` env var.

The solver itself lives in `shift_solver.py`; HTTP plumbing lives in
`main.py`; request/response Pydantic models live in `models.py`.

## Local setup

```bash
cd backend/solver
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run tests

```bash
pytest
```

## Run the service

```bash
uvicorn main:app --reload --port 8000
```

Then point Node at it:

```bash
export SOLVER_URL=http://localhost:8000
```

## Endpoints

### `GET /health`

Liveness check used by the Node client and by deployment infra.

Response:

```json
{ "status": "ok", "solver": "cp-sat" }
```

### `POST /solve`

Accepts a `SolveRequest` and returns a `SolveResult`. Both contracts are
snake_case JSON and are mirrored on the Node side in
`backend/src/services/solverClient.ts` — keep the field names in sync; do not
introduce camelCase aliases.

Request fields:

- `schedule_id` — Mongo `Schedule._id`
- `week_id` — e.g. `"2026-W18"`
- `workers[]` — `id`, `role` (`employee` | `manager`), `is_fixed_morning`,
  `availability[]` (each entry: `date`, `definition_id`, `can_work`)
- `shift_definitions[]` — `id`, `name`, `start_time`, `end_time`,
  `duration_minutes`, `crosses_midnight`
- `shifts[]` — `id`, `date`, `definition_id`, `required_count`

Response fields:

- `status` — `"OPTIMAL" | "FEASIBLE" | "RELAXED" | "INFEASIBLE"`
- `assignments[]` — `shift_id`, `worker_id`, `assigned_by` (`"algorithm"`)
- `violations[]` — `constraint_id`, `shift_id?`, `worker_id?`, `message`
- `warnings[]` — `constraint_id`, `worker_id?`, `message`
- `solve_time_ms`

Empty `workers`, `shifts`, or `shift_definitions` lists are rejected with
`422`.

## Integration with Node

Node calls this service through `backend/src/services/solverClient.ts`, which
posts to `${SOLVER_URL}/solve` with a `SolverClient` timeout controlled by
`SOLVER_TIMEOUT_MS` (default `30000`). The solver abstraction
(`backend/src/services/solver/`) selects this HTTP client by default; see
`SolverFactory.ts`.

## Tests

- `tests/test_shift_solver.py` — full scenario coverage of the CP-SAT model.
- `tests/test_health.py` — HTTP smoke test for `/health`.
- `tests/test_solve.py` — HTTP validation tests for `/solve`.
