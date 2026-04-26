"""Shared fixtures for ShiftSolver tests."""
from __future__ import annotations

import pytest
from models import (
    ConstraintEntry,
    ShiftDefInput,
    ShiftSlotInput,
    SolveRequest,
    WorkerInput,
)

# ---------------------------------------------------------------------------
# Shared shift definitions (Morning / Afternoon / Night)
# ---------------------------------------------------------------------------

MORNING = ShiftDefInput(
    id="def_morning",
    name="Morning",
    start_time="06:00",
    end_time="14:00",
    duration_minutes=480,
    crosses_midnight=False,
)

AFTERNOON = ShiftDefInput(
    id="def_afternoon",
    name="Afternoon",
    start_time="14:00",
    end_time="22:00",
    duration_minutes=480,
    crosses_midnight=False,
)

NIGHT = ShiftDefInput(
    id="def_night",
    name="Night",
    start_time="22:00",
    end_time="06:00",
    duration_minutes=480,
    crosses_midnight=True,
)

ALL_DEFS = [MORNING, AFTERNOON, NIGHT]

# Week 2026-W18: Sun 2026-04-26 → Sat 2026-05-02
WEEK_DATES = [
    "2026-04-26",  # Sunday    idx=0
    "2026-04-27",  # Monday    idx=1
    "2026-04-28",  # Tuesday   idx=2
    "2026-04-29",  # Wednesday idx=3
    "2026-04-30",  # Thursday  idx=4
    "2026-05-01",  # Friday    idx=5  (weekend)
    "2026-05-02",  # Saturday  idx=6  (weekend)
]


def make_slots(required_count: int = 1) -> list[ShiftSlotInput]:
    """Generate 21 shift slots (7 days × 3 types)."""
    slots = []
    for date in WEEK_DATES:
        for defn in ALL_DEFS:
            slots.append(
                ShiftSlotInput(
                    id=f"slot_{date}_{defn.id}",
                    date=date,
                    definition_id=defn.id,
                    required_count=required_count,
                )
            )
    return slots


def make_worker(
    worker_id: str,
    role: str = "employee",
    is_fixed_morning: bool = False,
    blocked: list[tuple[str, str]] | None = None,  # [(date, def_id), ...]
) -> WorkerInput:
    """Build a WorkerInput with optional canWork=false blocks."""
    availability: list[ConstraintEntry] = []
    if blocked:
        for date, def_id in blocked:
            availability.append(
                ConstraintEntry(date=date, definition_id=def_id, can_work=False)
            )
    return WorkerInput(
        id=worker_id,
        role=role,
        is_fixed_morning=is_fixed_morning,
        availability=availability,
    )


def make_request(
    workers: list[WorkerInput],
    slots: list[ShiftSlotInput] | None = None,
    required_count: int = 1,
) -> SolveRequest:
    return SolveRequest(
        schedule_id="sched_test",
        week_id="2026-W18",
        workers=workers,
        shift_definitions=ALL_DEFS,
        shifts=slots if slots is not None else make_slots(required_count),
    )
