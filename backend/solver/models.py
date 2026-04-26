from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Request types (Node.js backend → solver)
# ---------------------------------------------------------------------------

class ConstraintEntry(BaseModel):
    date: str           # "YYYY-MM-DD"
    definition_id: str  # ShiftDefinition._id
    can_work: bool


class WorkerInput(BaseModel):
    id: str
    role: Literal["employee", "manager"]
    is_fixed_morning: bool
    availability: list[ConstraintEntry]


class ShiftDefInput(BaseModel):
    id: str
    name: str            # "Morning" | "Afternoon" | "Night"
    start_time: str      # "HH:MM"
    end_time: str        # "HH:MM"
    duration_minutes: int
    crosses_midnight: bool


class ShiftSlotInput(BaseModel):
    id: str              # Shift._id from MongoDB
    date: str            # "YYYY-MM-DD"
    definition_id: str
    required_count: int


class SolveRequest(BaseModel):
    schedule_id: str
    week_id: str         # "2025-W18"
    workers: list[WorkerInput]
    shift_definitions: list[ShiftDefInput]
    shifts: list[ShiftSlotInput]  # 21 slots — 7 days × 3 shift types


# ---------------------------------------------------------------------------
# Response types (solver → Node.js backend)
# ---------------------------------------------------------------------------

class AssignmentOut(BaseModel):
    shift_id: str
    worker_id: str
    assigned_by: Literal["algorithm"] = "algorithm"


class Violation(BaseModel):
    constraint_id: str   # e.g. "FULL_COVERAGE", "MAXIMUM_LOAD"
    shift_id: Optional[str] = None
    worker_id: Optional[str] = None
    message: str


class Warning(BaseModel):
    constraint_id: str   # e.g. "SHIFT_BALANCE", "WEEKEND_BALANCE"
    worker_id: Optional[str] = None
    message: str


class SolveResult(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "RELAXED", "INFEASIBLE"]
    assignments: list[AssignmentOut]
    violations: list[Violation]
    warnings: list[Warning]
    solve_time_ms: int
