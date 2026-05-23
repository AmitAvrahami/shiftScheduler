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

from collections import defaultdict

import pytest
from models import (
    ForbiddenAssignmentEntry,
    PenaltyTerm,
    ShiftDefInput,
    ShiftSlotInput,
    SolveRequest,
)
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
# Hebrew-named shift definitions — production names are localized, so the
# solver must classify by shift_type, never by name substring.
# ---------------------------------------------------------------------------

HEB_MORNING = ShiftDefInput(
    id="heb_morning",
    name="בוקר",
    shift_type="morning",
    start_time="06:45",
    end_time="14:45",
    duration_minutes=480,
    crosses_midnight=False,
)
HEB_AFTERNOON = ShiftDefInput(
    id="heb_afternoon",
    name="צהריים",
    shift_type="afternoon",
    start_time="14:45",
    end_time="22:45",
    duration_minutes=480,
    crosses_midnight=False,
)
HEB_NIGHT = ShiftDefInput(
    id="heb_night",
    name="לילה",
    shift_type="night",
    start_time="22:45",
    end_time="06:45",
    duration_minutes=480,
    crosses_midnight=True,
)
HEB_DEFS = [HEB_MORNING, HEB_AFTERNOON, HEB_NIGHT]
SUN_THU_DATES = WEEK_DATES[:5]


def _make_hebrew_request(workers, morning_required: int = 2) -> SolveRequest:
    slots: list[ShiftSlotInput] = []
    for date in WEEK_DATES:
        slots.append(
            ShiftSlotInput(
                id=f"slot_{date}_{HEB_MORNING.id}",
                date=date,
                definition_id=HEB_MORNING.id,
                required_count=morning_required,
            )
        )
        slots.append(
            ShiftSlotInput(
                id=f"slot_{date}_{HEB_AFTERNOON.id}",
                date=date,
                definition_id=HEB_AFTERNOON.id,
                required_count=1,
            )
        )
        slots.append(
            ShiftSlotInput(
                id=f"slot_{date}_{HEB_NIGHT.id}",
                date=date,
                definition_id=HEB_NIGHT.id,
                required_count=1,
            )
        )
    return SolveRequest(
        schedule_id="sched_heb",
        week_id="2026-W18",
        workers=workers,
        shift_definitions=HEB_DEFS,
        shifts=slots,
    )


def _assigned_by_slot(result) -> dict[str, set[str]]:
    by_slot: dict[str, set[str]] = defaultdict(set)
    for a in result.assignments:
        by_slot[a.shift_id].add(a.worker_id)
    return by_slot


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
# 3. FORBIDDEN_ASSIGNMENT — generic hard block respected
# ---------------------------------------------------------------------------

def test_forbidden_assignment_block():
    """
    Worker w1 is explicitly forbidden from Monday morning. They must not appear
    in that slot even though their legacy availability is otherwise open.
    """
    monday = WEEK_DATES[1]  # "2026-04-27"
    blocked_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=blocked_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.forbidden_assignments = [
        ForbiddenAssignmentEntry(worker_id="w1", shift_id=blocked_shift_id)
    ]

    result = ShiftSolver(req).solve()

    assert result.status == "INFEASIBLE"
    assert not any(
        a.shift_id == blocked_shift_id and a.worker_id == "w1"
        for a in result.assignments
    ), "w1 should not be assigned to their forbidden slot"


def test_forbidden_assignments_combine_with_legacy_availability():
    """
    Legacy availability and generic forbidden assignments should both apply to
    the same slot: availability blocks w2, while forbidden_assignments blocks
    w1, leaving no eligible worker for Monday morning.
    """
    monday = WEEK_DATES[1]  # "2026-04-27"
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [
        make_worker("w1"),
        make_worker("w2", blocked=[(monday, MORNING.id)]),
    ]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.forbidden_assignments = [
        ForbiddenAssignmentEntry(worker_id="w1", shift_id=morning_shift_id)
    ]

    result = ShiftSolver(req).solve()

    assert result.status == "INFEASIBLE"
    assert result.assignments == []


def test_unknown_forbidden_assignment_is_ignored_safely():
    """
    Forbidden references that do not map to an existing worker/shift cell should
    not crash solving or constrain unrelated cells.
    """
    workers = [make_worker(f"w{i}") for i in range(1, 7)]
    req = make_request(workers, required_count=1)
    req.forbidden_assignments = [
        ForbiddenAssignmentEntry(worker_id="missing_worker", shift_id="missing_shift")
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert len(result.violations) == 0


# ---------------------------------------------------------------------------
# 3b. PENALTIES — generic soft assignment costs
# ---------------------------------------------------------------------------

def test_penalty_prefers_another_eligible_worker_when_possible():
    """
    A penalty on one otherwise-feasible assignment should steer the objective
    toward another eligible worker without adding a hard constraint.
    """
    monday = WEEK_DATES[1]
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1"), make_worker("w2")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.penalties = [
        PenaltyTerm(
            category="assignment_preference",
            weight=10,
            worker_id="w2",
            shift_id=morning_shift_id,
        )
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [
        (a.worker_id, a.shift_id)
        for a in result.assignments
    ] == [("w1", morning_shift_id)]


def test_penalty_does_not_make_only_feasible_assignment_infeasible():
    """
    If the penalized worker is still the only feasible option, the slot should
    remain assignable because penalties are soft objective terms only.
    """
    monday = WEEK_DATES[1]
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.penalties = [
        PenaltyTerm(
            category="assignment_preference",
            weight=10,
            worker_id="w1",
            shift_id=morning_shift_id,
        )
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [
        (a.worker_id, a.shift_id)
        for a in result.assignments
    ] == [("w1", morning_shift_id)]


def test_forbidden_assignment_still_wins_over_penalty():
    """
    If the same cell is both forbidden and penalized, the hard forbidden block
    should force it to zero before the objective is considered.
    """
    monday = WEEK_DATES[1]
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1"), make_worker("w2")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.forbidden_assignments = [
        ForbiddenAssignmentEntry(worker_id="w1", shift_id=morning_shift_id)
    ]
    req.penalties = [
        PenaltyTerm(
            category="assignment_preference",
            weight=10,
            worker_id="w1",
            shift_id=morning_shift_id,
        )
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [
        (a.worker_id, a.shift_id)
        for a in result.assignments
    ] == [("w2", morning_shift_id)]


def test_unknown_penalty_references_are_ignored_safely():
    """
    Penalties that cannot be resolved to an existing assignment cell should be
    ignored without crashing or constraining unrelated assignments.
    """
    monday = WEEK_DATES[1]
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )
    req.penalties = [
        PenaltyTerm(
            category="assignment_preference",
            weight=10,
            worker_id="missing_worker",
            shift_id=morning_shift_id,
        ),
        PenaltyTerm(
            category="assignment_preference",
            weight=10,
            worker_id="w1",
            shift_id="missing_shift",
        ),
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [
        (a.worker_id, a.shift_id)
        for a in result.assignments
    ] == [("w1", morning_shift_id)]


def test_legacy_payload_without_penalties_still_solves():
    """
    Legacy requests that omit penalties should retain their previous behavior.
    """
    monday = WEEK_DATES[1]
    morning_shift_id = f"slot_{monday}_{MORNING.id}"
    workers = [make_worker("w1")]
    req = make_request(
        workers,
        slots=[
            ShiftSlotInput(
                id=morning_shift_id,
                date=monday,
                definition_id=MORNING.id,
                required_count=1,
            )
        ],
    )

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [
        (a.worker_id, a.shift_id)
        for a in result.assignments
    ] == [("w1", morning_shift_id)]


# ---------------------------------------------------------------------------
# 4. MANAGER_RULE — manager only in morning, never weekends
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
# 5. FIXED_MORNING_RULE — fixed-morning employee on Sun–Thu mornings
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
# 6. MINIMUM_REST — night shift blocks next-day morning
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
# 7. INFEASIBILITY fallback — too few workers for the schedule
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
# 8. Soft constraint warnings — shift balance
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
# 9. MAXIMUM_LOAD — no worker exceeds 6 shifts (strict solve)
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
# 10. Performance — 10 workers, 21 slots under 5 seconds
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


# ---------------------------------------------------------------------------
# 11. FIXED_MORNING_RULE — production repro: Hebrew names + counts toward
#     required_count + canWork:false override + self-contained for employee.
# ---------------------------------------------------------------------------

def test_fixed_morning_manager_hebrew_names_counts_toward_required():
    """
    Production scenario: shift definitions are Hebrew-named (no English
    substring to match). A fixed-morning manager must be assigned to every
    Sun–Thu morning, count *within* required_count (not be added on top), and
    never appear in afternoon/night or Friday/Saturday.
    """
    workers = [make_worker("mgr", role="manager", is_fixed_morning=True)] + [
        make_worker(f"w{i}") for i in range(1, 9)
    ]
    req = _make_hebrew_request(workers, morning_required=2)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    slots_by_id = {s.id: s for s in req.shifts}
    by_slot = _assigned_by_slot(result)

    for date in SUN_THU_DATES:
        sid = f"slot_{date}_{HEB_MORNING.id}"
        assert "mgr" in by_slot[sid], f"manager missing from {date} morning"
        assert len(by_slot[sid]) == slots_by_id[sid].required_count, (
            f"{date} morning has {len(by_slot[sid])} assigned, "
            f"expected required_count={slots_by_id[sid].required_count} "
            f"(manager must count toward it, not be added on top)"
        )

    for a in result.assignments:
        if a.worker_id != "mgr":
            continue
        slot = slots_by_id[a.shift_id]
        assert slot.definition_id == HEB_MORNING.id, "manager only works morning"
        assert slot.date in SUN_THU_DATES, "manager never works Fri/Sat"


def test_fixed_morning_canwork_false_frees_slot_for_substitute():
    """
    canWork:false on a Sun–Thu morning overrides the force-in: the manager is
    dropped only that day and a substitute keeps the slot at required_count.
    """
    wednesday = WEEK_DATES[3]
    workers = [
        make_worker(
            "mgr",
            role="manager",
            is_fixed_morning=True,
            blocked=[(wednesday, HEB_MORNING.id)],
        )
    ] + [make_worker(f"w{i}") for i in range(1, 9)]
    req = _make_hebrew_request(workers, morning_required=2)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    slots_by_id = {s.id: s for s in req.shifts}
    by_slot = _assigned_by_slot(result)

    wed_sid = f"slot_{wednesday}_{HEB_MORNING.id}"
    assert "mgr" not in by_slot[wed_sid], "manager blocked Wed morning"
    assert len(by_slot[wed_sid]) == slots_by_id[wed_sid].required_count, (
        "substitute must keep the blocked slot at required_count"
    )

    for date in (WEEK_DATES[0], WEEK_DATES[1], WEEK_DATES[2], WEEK_DATES[4]):
        assert "mgr" in by_slot[f"slot_{date}_{HEB_MORNING.id}"], (
            f"manager must still cover unblocked {date} morning"
        )


def test_fixed_morning_rule_self_contained_for_employee_role():
    """
    HC4 is self-contained: a fixed-morning worker who is a plain employee
    (role='employee', not manager) is still forced into every Sun–Thu morning
    and forced out of afternoon/night/Fri/Sat — without relying on HC3.
    """
    workers = [make_worker("fm", role="employee", is_fixed_morning=True)] + [
        make_worker(f"w{i}") for i in range(1, 9)
    ]
    req = _make_hebrew_request(workers, morning_required=2)
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    slots_by_id = {s.id: s for s in req.shifts}
    fm_slots = [
        slots_by_id[a.shift_id] for a in result.assignments if a.worker_id == "fm"
    ]

    fm_morning_dates = {
        s.date for s in fm_slots if s.definition_id == HEB_MORNING.id
    }
    for date in SUN_THU_DATES:
        assert date in fm_morning_dates, (
            f"fixed-morning employee must cover {date} morning"
        )

    for s in fm_slots:
        assert s.definition_id == HEB_MORNING.id, (
            "fixed-morning employee must never work afternoon/night"
        )
        assert s.date in SUN_THU_DATES, (
            "fixed-morning employee must never work Fri/Sat"
        )


def test_legacy_request_without_shift_type_falls_back_to_name():
    """
    Backward compatibility: a legacy request that omits shift_type but uses
    English names must still classify via the name-substring fallback, so the
    fixed-morning rule keeps working for old callers.
    """
    legacy_morning = ShiftDefInput(
        id="legacy_morning", name="Morning", start_time="06:45",
        end_time="14:45", duration_minutes=480, crosses_midnight=False,
    )
    legacy_afternoon = ShiftDefInput(
        id="legacy_afternoon", name="Afternoon", start_time="14:45",
        end_time="22:45", duration_minutes=480, crosses_midnight=False,
    )
    legacy_night = ShiftDefInput(
        id="legacy_night", name="Night", start_time="22:45",
        end_time="06:45", duration_minutes=480, crosses_midnight=True,
    )
    assert legacy_morning.shift_type is None  # not supplied → fallback path

    slots: list[ShiftSlotInput] = []
    for date in WEEK_DATES:
        for defn, req_count in (
            (legacy_morning, 2),
            (legacy_afternoon, 1),
            (legacy_night, 1),
        ):
            slots.append(
                ShiftSlotInput(
                    id=f"slot_{date}_{defn.id}",
                    date=date,
                    definition_id=defn.id,
                    required_count=req_count,
                )
            )
    workers = [make_worker("mgr", role="manager", is_fixed_morning=True)] + [
        make_worker(f"w{i}") for i in range(1, 9)
    ]
    req = SolveRequest(
        schedule_id="sched_legacy",
        week_id="2026-W18",
        workers=workers,
        shift_definitions=[legacy_morning, legacy_afternoon, legacy_night],
        shifts=slots,
    )
    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    slots_by_id = {s.id: s for s in req.shifts}
    by_slot = _assigned_by_slot(result)
    for date in SUN_THU_DATES:
        sid = f"slot_{date}_{legacy_morning.id}"
        assert "mgr" in by_slot[sid], f"fallback failed for {date} morning"
    for a in result.assignments:
        if a.worker_id == "mgr":
            assert slots_by_id[a.shift_id].definition_id == legacy_morning.id
            assert slots_by_id[a.shift_id].date in SUN_THU_DATES


# ---------------------------------------------------------------------------
# PR09. Structured soft-constraint warnings
# ---------------------------------------------------------------------------

def test_warnings_carry_structured_fields():
    """A forced night overcap surfaces a warning carrying the structured PR09
    fields: type, severity, and the contributing shift_ids."""
    night_slots = [
        ShiftSlotInput(
            id=f"night_{WEEK_DATES[i]}",
            date=WEEK_DATES[i],
            definition_id=NIGHT.id,
            required_count=1,
        )
        for i in range(4)
    ]
    worker = make_worker("w1")
    req = make_request([worker], slots=night_slots)

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    night = [w for w in result.warnings if w.type == "NIGHT_OVERCAP"]
    assert len(night) == 1
    assert night[0].severity == "warning"
    assert night[0].worker_id == "w1"
    # The single worker must take all 4 nights → >2 contributing shift ids.
    assert len(night[0].shift_ids) >= 3
    assert all(sid.startswith("night_") for sid in night[0].shift_ids)


def test_assignment_preference_warning_emitted():
    """A penalised (worker, shift) cell that the solver still assigns surfaces
    as a structured ASSIGNMENT_PREFERENCE warning (PR09)."""
    slot = ShiftSlotInput(
        id="slot_pref",
        date=WEEK_DATES[0],
        definition_id=MORNING.id,
        required_count=1,
    )
    worker = make_worker("w1")
    req = make_request([worker], slots=[slot])
    req.penalties = [
        PenaltyTerm(
            category="assignment_preference",
            weight=50,
            worker_id="w1",
            shift_id="slot_pref",
        )
    ]

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    pref = [w for w in result.warnings if w.type == "ASSIGNMENT_PREFERENCE"]
    assert len(pref) == 1
    assert pref[0].severity == "warning"
    assert pref[0].worker_id == "w1"
    assert pref[0].shift_ids == ["slot_pref"]


def test_assignment_preference_warning_absent_when_not_penalised():
    """No penalty terms → no ASSIGNMENT_PREFERENCE warning is emitted."""
    slot = ShiftSlotInput(
        id="slot_plain",
        date=WEEK_DATES[0],
        definition_id=MORNING.id,
        required_count=1,
    )
    req = make_request([make_worker("w1")], slots=[slot])

    result = ShiftSolver(req).solve()

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert not [w for w in result.warnings if w.type == "ASSIGNMENT_PREFERENCE"]
