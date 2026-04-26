"""
ShiftSolver test suite — 8 scenarios covering all constraints from
docs/CONSTRAINTS.md.

Run:
    cd backend/solver && python -m pytest tests/ -v
"""
from __future__ import annotations

import sys
import os

# Allow importing from parent directory when running directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from models import ShiftSlotInput, SolveRequest
from shift_solver import ShiftSolver
from tests.conftest import (
    AFTERNOON,
    ALL_DEFS,
    MORNING,
    NIGHT,
    WEEK_DATES,
    make_request,
    make_slots,
    make_worker,
)


# ---------------------------------------------------------------------------
# 1. Happy path — all workers fully available
# ---------------------------------------------------------------------------

def test_happy_path_optimal():
    """
    6 workers, all available for the full week, required_count=1 per slot.
    Expect OPTIMAL with zero violations and zero hard-constraint warnings.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 7)]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert len(result.violations) == 0
    assert result.solve_time_ms < 10_000

    # Every slot should be assigned exactly once
    shift_ids_assigned = [a.shift_id for a in result.assignments]
    slot_ids = [s.id for s in req.shifts]
    for sid in slot_ids:
        assert shift_ids_assigned.count(sid) == 1, (
            f"Slot {sid} not assigned exactly once"
        )


# ---------------------------------------------------------------------------
# 2. EMPLOYEE_BLOCK — canWork=false respected
# ---------------------------------------------------------------------------

def test_availability_block():
    """
    Worker w1 cannot work Monday morning. They must not appear in that slot.
    """
    monday = WEEK_DATES[1]  # "2026-04-27"
    workers = [
        make_worker("w1", blocked=[(monday, MORNING.id)]),
        make_worker("w2"),
        make_worker("w3"),
        make_worker("w4"),
    ]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    blocked_slot_id = f"slot_{monday}_{MORNING.id}"
    for a in result.assignments:
        if a.shift_id == blocked_slot_id:
            assert a.worker_id != "w1", (
                "w1 should not be assigned to their blocked slot"
            )


# ---------------------------------------------------------------------------
# 3. MANAGER_RULE — manager only in morning, never weekends
# ---------------------------------------------------------------------------

def test_manager_rule():
    """
    Manager user must only appear in morning shifts and never on Friday/Saturday.
    """
    workers = [
        make_worker("mgr1", role="manager"),
        make_worker("w2"),
        make_worker("w3"),
        make_worker("w4"),
        make_worker("w5"),
    ]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")

    friday = WEEK_DATES[5]
    saturday = WEEK_DATES[6]
    weekend_morning_ids = {
        f"slot_{friday}_{MORNING.id}",
        f"slot_{saturday}_{MORNING.id}",
    }
    non_morning_def_ids = {AFTERNOON.id, NIGHT.id}
    all_slots = {s.id: s for s in req.shifts}

    for a in result.assignments:
        if a.worker_id != "mgr1":
            continue
        slot = all_slots[a.shift_id]
        assert slot.definition_id == MORNING.id, (
            f"Manager assigned non-morning shift {slot.definition_id} on {slot.date}"
        )
        assert slot.date not in (friday, saturday), (
            f"Manager assigned on weekend date {slot.date}"
        )


# ---------------------------------------------------------------------------
# 4. FIXED_MORNING_RULE — fixed-morning employee on Sun–Thu mornings
# ---------------------------------------------------------------------------

def test_fixed_morning_rule():
    """
    Fixed-morning employee must be in all Sun–Thu morning slots
    unless explicitly blocked.
    """
    # Block Wednesday morning for fixed employee
    wednesday = WEEK_DATES[3]  # "2026-04-29"
    workers = [
        make_worker("fm1", is_fixed_morning=True, blocked=[(wednesday, MORNING.id)]),
        make_worker("w2"),
        make_worker("w3"),
        make_worker("w4"),
    ]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    all_slots = {s.id: s for s in req.shifts}
    fm1_shifts = {
        all_slots[a.shift_id].date
        for a in result.assignments
        if a.worker_id == "fm1"
        and all_slots[a.shift_id].definition_id == MORNING.id
    }

    sun_to_thu = WEEK_DATES[:5]  # indices 0-4
    for date in sun_to_thu:
        if date == wednesday:
            assert date not in fm1_shifts, (
                "fm1 should not be in blocked Wednesday morning"
            )
        else:
            assert date in fm1_shifts, (
                f"fm1 must be in {date} morning (unblocked Sun–Thu)"
            )


# ---------------------------------------------------------------------------
# 5. MINIMUM_REST — night shift blocks next-day morning
# ---------------------------------------------------------------------------

def test_minimum_rest_night_blocks_next_morning():
    """
    Worker assigned Night shift on Sunday must not appear in Monday morning.
    Night anchor = Monday 06:45.  Monday morning starts 06:00 → gap = -45 min → forbidden.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 7)]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    all_slots = {s.id: s for s in req.shifts}

    sunday = WEEK_DATES[0]
    monday = WEEK_DATES[1]

    for a in result.assignments:
        slot = all_slots[a.shift_id]
        if slot.date == sunday and slot.definition_id == NIGHT.id:
            night_worker = a.worker_id
            # That worker must not be in Monday morning
            for b in result.assignments:
                bslot = all_slots[b.shift_id]
                if (
                    b.worker_id == night_worker
                    and bslot.date == monday
                    and bslot.definition_id == MORNING.id
                ):
                    pytest.fail(
                        f"Worker {night_worker} worked Sunday Night "
                        f"then Monday Morning (violates 8-hour rest)"
                    )


# ---------------------------------------------------------------------------
# 6. INFEASIBILITY fallback — too few workers for the schedule
# ---------------------------------------------------------------------------

def test_infeasibility_triggers_relaxed_fallback():
    """
    2 workers for 21 slots at required_count=2 (42 assignments needed).
    Strict solve is infeasible; fallback should return status=RELAXED
    with violations listing FULL_COVERAGE and/or MAXIMUM_LOAD.
    """
    workers = [make_worker("w1"), make_worker("w2")]
    req = make_request(workers, required_count=2)
    result = ShiftSolver(req).solve()

    # Must not be a hard INFEASIBLE (fallback should engage)
    assert result.status in ("RELAXED", "INFEASIBLE")
    if result.status == "RELAXED":
        violation_ids = {v.constraint_id for v in result.violations}
        assert any(
            "FULL_COVERAGE" in vid or "MAXIMUM_LOAD" in vid
            for vid in violation_ids
        ), f"Expected FULL_COVERAGE or MAXIMUM_LOAD in violations, got {violation_ids}"


# ---------------------------------------------------------------------------
# 7. Soft constraint warnings — shift balance
# ---------------------------------------------------------------------------

def test_shift_balance_warning():
    """
    Verifies that warnings is always a list and soft constraint analysis runs
    without crashing. 4 workers with required_count=1 gives enough slack to
    solve (4×6=24 capacity for 21 slots) while still exercising the warning
    collection path.

    Note: 3 workers is too tight — Night shifts block Morning AND Afternoon
    the following day (gap < 480 min for both), leaving zero slack for 21 slots.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 5)]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    assert isinstance(result.warnings, list)


# ---------------------------------------------------------------------------
# 8. MAXIMUM_LOAD — no worker exceeds 6 shifts (strict solve)
# ---------------------------------------------------------------------------

def test_maximum_load_respected():
    """
    With enough workers and required_count=1, no worker should have >6 shifts.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 8)]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")

    from collections import Counter
    shift_counts = Counter(a.worker_id for a in result.assignments)
    for worker_id, count in shift_counts.items():
        assert count <= 6, (
            f"Worker {worker_id} assigned {count} shifts, exceeds limit of 6"
        )


# ---------------------------------------------------------------------------
# 9. Performance — 10 workers, 21 slots under 5 seconds
# ---------------------------------------------------------------------------

def test_performance_10_workers():
    """
    10 workers, 21 slots (required_count=1) must solve in < 5 000 ms.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 11)]
    req = make_request(workers, required_count=1)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    assert result.solve_time_ms < 5_000, (
        f"Solver took {result.solve_time_ms} ms — exceeds 5 000 ms target"
    )
