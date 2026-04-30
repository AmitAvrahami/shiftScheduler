from fastapi import FastAPI, HTTPException
from models import SolveRequest, SolveResult
from shift_solver import ShiftSolver

app = FastAPI(title="ShiftScheduler CP-SAT Solver", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "solver": "cp-sat"}


@app.post("/solve", response_model=SolveResult)
def solve(request: SolveRequest) -> SolveResult:
    if not request.workers:
        raise HTTPException(status_code=422, detail="workers list is empty")
    if not request.shifts:
        raise HTTPException(status_code=422, detail="shifts list is empty")
    if not request.shift_definitions:
        raise HTTPException(status_code=422, detail="shift_definitions list is empty")

    solver = ShiftSolver(request)
    return solver.solve()
