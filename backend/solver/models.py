from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


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
    name: str            # localized display name (Hebrew in prod)
    # Language-independent classification supplied by the Node mapper. Optional
    # for backward compatibility: legacy requests without it fall back to
    # English name-substring detection in ShiftSolver.
    shift_type: Optional[Literal["morning", "afternoon", "night"]] = None
    start_time: str      # "HH:MM"
    end_time: str        # "HH:MM"
    duration_minutes: int
    crosses_midnight: bool


class ShiftSlotInput(BaseModel):
    id: str              # Shift._id from MongoDB
    date: str            # "YYYY-MM-DD"
    definition_id: str
    required_count: int


class ForbiddenAssignmentEntry(BaseModel):
    """A single forbidden (worker, shift) cell emitted by the Node compiler.

    Accepted as part of the PR #3 dual-payload transport and consumed by the
    CP-SAT model as an additive hard block.
    """

    worker_id: str
    shift_id: str


class PenaltyTerm(BaseModel):
    """A single soft-constraint penalty term emitted by the Node compiler.

    ``category`` is intentionally typed as ``str`` (not a ``Literal``) so the
    solver does not need to be redeployed whenever Node introduces a new
    soft-constraint category. Assignment-targeted penalties are consumed by
    the CP-SAT objective when both ``worker_id`` and ``shift_id`` resolve to an
    existing solver cell.
    """

    category: str
    weight: float
    worker_id: Optional[str] = None
    shift_id: Optional[str] = None


class RelaxationWeights(BaseModel):
    """Relaxation weights mirrored from Node for the future generic path."""

    load: int
    coverage: int


class SolveRequest(BaseModel):
    schedule_id: str
    week_id: str         # "2025-W18"
    workers: list[WorkerInput]
    shift_definitions: list[ShiftDefInput]
    shifts: list[ShiftSlotInput]  # 21 slots — 7 days × 3 shift types

    # PR #3 — dual-payload transport. Legacy availability remains supported,
    # and forbidden_assignments provides additive generic hard blocks.
    forbidden_assignments: list[ForbiddenAssignmentEntry] = Field(default_factory=list)
    penalties: list[PenaltyTerm] = Field(default_factory=list)
    relaxation_weights: Optional[RelaxationWeights] = None


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
    constraint_id: str   # e.g. "SHIFT_BALANCE", "WEEKEND_BALANCE" — rule code, kept for back-compat
    # Structured fields (PR09). Additive and optional so an older Node consumer
    # still parses, and a future caller can map a warning to specific board cells.
    type: str = ""              # machine code; mirrors constraint_id for existing rules
    severity: Literal["info", "warning"] = "warning"
    worker_id: Optional[str] = None
    shift_ids: list[str] = Field(default_factory=list)  # assigned shifts this warning relates to
    message: str


class SolveResult(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "RELAXED", "INFEASIBLE"]
    assignments: list[AssignmentOut]
    violations: list[Violation]
    warnings: list[Warning]
    solve_time_ms: int
