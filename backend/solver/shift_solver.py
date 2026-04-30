from __future__ import annotations

import math
import time
from collections import defaultdict
from typing import Optional

from ortools.sat.python import cp_model

from models import (
    AssignmentOut,
    ShiftDefInput,
    ShiftSlotInput,
    SolveRequest,
    SolveResult,
    Violation,
    Warning,
    WorkerInput,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_REST_MINUTES = 480          # 8 hours
PREFERRED_REST_MINUTES = 960    # 16 hours (REST_OPTIMISATION soft threshold)

# Night shifts end at 06:45 the *next* calendar day — this is the anchor used
# for MINIMUM_REST checks, not the ShiftDefinition.endTime field.
NIGHT_ANCHOR_MINUTES = 6 * 60 + 45  # 405 minutes past midnight of next day

SOLVER_TIMEOUT_SECONDS = 10

# Soft-constraint penalty weights
W_SHIFT_BALANCE = 100
W_TYPE_DIVERSITY = 200
W_REST_OPTIMISATION = 150
W_WEEKEND_BALANCE = 300
W_NIGHT_OVERCAP = 400
W_FRI_SAT_CLUSTER = 300

# Relaxed-fallback penalty weights (must dominate all soft weights combined)
W_RELAXED_LOAD = 10_000
W_RELAXED_COVERAGE = 10_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hhmm_to_minutes(t: str) -> int:
    """Convert "HH:MM" to total minutes from midnight."""
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _effective_end_minutes(defn: ShiftDefInput, next_day: bool = False) -> int:
    """
    Return the effective end time in minutes relative to the shift's *start* day.
    Night shifts that cross midnight use the special 06:45 next-day anchor
    instead of their nominal endTime.
    """
    if defn.crosses_midnight:
        return NIGHT_ANCHOR_MINUTES + 24 * 60  # expressed as next-day offset
    end = _hhmm_to_minutes(defn.end_time)
    return end


def _rest_gap_minutes(prev: ShiftDefInput, next_def: ShiftDefInput) -> int:
    """
    Gap in minutes between the effective end of prev_shift (on day D)
    and the start of next_def (on day D+1).
    Both times expressed relative to midnight of day D.
    """
    if prev.crosses_midnight:
        prev_end = NIGHT_ANCHOR_MINUTES + 24 * 60
    else:
        prev_end = _hhmm_to_minutes(prev.end_time)

    next_start = _hhmm_to_minutes(next_def.start_time) + 24 * 60  # day D+1
    return next_start - prev_end


# ---------------------------------------------------------------------------
# ShiftSolver
# ---------------------------------------------------------------------------

class ShiftSolver:
    """
    CP-SAT model for shift scheduling.

    Variables
    ---------
    shifts[(worker_id, day_idx, def_id)]: BoolVar
        1 → worker is assigned to that shift on that day.

    Hard constraints enforce absolute rules from docs/CONSTRAINTS.md.
    Soft constraints contribute penalty terms to model.Minimize().
    """

    def __init__(self, request: SolveRequest) -> None:
        self.request = request

        # Index lookups built once in _prepare_indices()
        self.workers: list[WorkerInput] = request.workers
        self.defs: list[ShiftDefInput] = request.shift_definitions
        self.slots: list[ShiftSlotInput] = request.shifts

        # Sorted unique dates → day_idx 0..N-1
        self.dates: list[str] = sorted({s.date for s in self.slots})
        self.date_to_idx: dict[str, int] = {d: i for i, d in enumerate(self.dates)}
        self.def_by_id: dict[str, ShiftDefInput] = {d.id: d for d in self.defs}
        self.worker_by_id: dict[str, WorkerInput] = {w.id: w for w in self.workers}

        # Availability index: (worker_id, date, def_id) → can_work
        self.avail: dict[tuple[str, str, str], bool] = {}
        for w in self.workers:
            for e in w.availability:
                self.avail[(w.id, e.date, e.definition_id)] = e.can_work

        # Slot index: (date, def_id) → ShiftSlotInput
        self.slot_by_key: dict[tuple[str, str], ShiftSlotInput] = {
            (s.date, s.definition_id): s for s in self.slots
        }

        # Weekend day indices (Friday=5, Saturday=6 in Sun-based 0-indexed week)
        self.weekend_day_idxs: set[int] = set()
        for date, idx in self.date_to_idx.items():
            import datetime
            dt = datetime.date.fromisoformat(date)
            if dt.weekday() in (4, 5):  # Python: Mon=0, Fri=4, Sat=5
                self.weekend_day_idxs.add(idx)

        # Morning definition id(s)
        self.morning_def_ids: set[str] = {
            d.id for d in self.defs if "morning" in d.name.lower()
        }
        # Night definition id(s)
        self.night_def_ids: set[str] = {
            d.id for d in self.defs if "night" in d.name.lower()
        }
        # Afternoon definition id(s)
        self.afternoon_def_ids: set[str] = {
            d.id for d in self.defs if "afternoon" in d.name.lower()
        }

        # Sun–Thu indices (no Friday=5, Saturday=6)
        self.sun_thu_idxs: set[int] = set(range(len(self.dates))) - self.weekend_day_idxs

        # Manager and fixed-morning worker ids
        self.manager_ids: set[str] = {w.id for w in self.workers if w.role == "manager"}
        self.fixed_morning_ids: set[str] = {
            w.id for w in self.workers if w.is_fixed_morning
        }

        # Will be populated by _create_shift_variables()
        self.shifts: dict[tuple[str, int, str], cp_model.IntVar] = {}
        self.model: Optional[cp_model.CpModel] = None

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def solve(self) -> SolveResult:
        t0 = time.monotonic()
        result = self._attempt_solve(relaxed=False)
        if result.status in ("OPTIMAL", "FEASIBLE"):
            result.solve_time_ms = int((time.monotonic() - t0) * 1000)
            return result

        result = self._attempt_solve(relaxed=True)
        result.solve_time_ms = int((time.monotonic() - t0) * 1000)
        return result

    # ------------------------------------------------------------------
    # Model build + solve
    # ------------------------------------------------------------------

    def _attempt_solve(self, relaxed: bool) -> SolveResult:
        self.model = cp_model.CpModel()
        self.shifts = {}
        self._relaxed_mode = relaxed

        self._create_shift_variables()

        # Hard constraints
        self._enforce_single_shift_per_day()
        self._enforce_availability_blocks()
        self._enforce_manager_rule()
        self._enforce_fixed_morning_rule()
        self._enforce_minimum_rest()

        penalty_terms: list[cp_model.LinearExprT] = []

        if relaxed:
            penalty_terms += self._enforce_weekly_shift_limit_soft()
            penalty_terms += self._enforce_full_coverage_soft()
        else:
            self._enforce_weekly_shift_limit()
            self._enforce_full_coverage()

        # Soft constraints
        penalty_terms += self._penalize_shift_imbalance()
        penalty_terms += self._penalize_type_concentration()
        penalty_terms += self._penalize_poor_rest_transitions()
        penalty_terms += self._penalize_weekend_concentration()
        penalty_terms += self._penalize_night_overload()
        penalty_terms += self._penalize_friday_saturday_cluster()

        if penalty_terms:
            self.model.Minimize(sum(penalty_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = SOLVER_TIMEOUT_SECONDS
        status_code = solver.Solve(self.model)

        if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            self._solver = solver
            assignments = self._extract_assignments()
            violations = self._collect_violations(assignments, relaxed=relaxed)
            warnings = self._collect_warnings(assignments)
            status_label: str
            if relaxed:
                status_label = "RELAXED"
            elif status_code == cp_model.OPTIMAL:
                status_label = "OPTIMAL"
            else:
                status_label = "FEASIBLE"
            return SolveResult(
                status=status_label,
                assignments=assignments,
                violations=violations,
                warnings=warnings,
                solve_time_ms=0,
            )

        return SolveResult(
            status="INFEASIBLE",
            assignments=[],
            violations=[
                Violation(
                    constraint_id="INFEASIBLE",
                    message="No valid assignment exists even after constraint relaxation."
                    if relaxed
                    else "Model is infeasible under strict constraints. Attempting relaxed solve.",
                )
            ],
            warnings=[],
            solve_time_ms=0,
        )

    # ------------------------------------------------------------------
    # Variable creation
    # ------------------------------------------------------------------

    def _create_shift_variables(self) -> None:
        for w in self.workers:
            for day_idx, date in enumerate(self.dates):
                for d in self.defs:
                    if (date, d.id) in self.slot_by_key:
                        var = self.model.NewBoolVar(f"s_{w.id}_{day_idx}_{d.id}")
                        self.shifts[(w.id, day_idx, d.id)] = var

    # ------------------------------------------------------------------
    # Hard constraints
    # ------------------------------------------------------------------

    def _enforce_single_shift_per_day(self) -> None:
        """HC5: A worker cannot be assigned more than one shift per calendar day."""
        for w in self.workers:
            for day_idx, date in enumerate(self.dates):
                day_vars = [
                    self.shifts[(w.id, day_idx, d.id)]
                    for d in self.defs
                    if (w.id, day_idx, d.id) in self.shifts
                ]
                if len(day_vars) > 1:
                    self.model.AddAtMostOne(day_vars)

    def _enforce_availability_blocks(self) -> None:
        """HC2: canWork=false → shift variable forced to 0."""
        for w in self.workers:
            for day_idx, date in enumerate(self.dates):
                for d in self.defs:
                    key = (w.id, day_idx, d.id)
                    if key not in self.shifts:
                        continue
                    can = self.avail.get((w.id, date, d.id), True)
                    if not can:
                        self.model.Add(self.shifts[key] == 0)

    def _enforce_manager_rule(self) -> None:
        """
        HC3: Manager → morning shifts only; no weekend shifts.
        Any non-morning or any weekend variable is forced to 0.
        """
        for manager_id in self.manager_ids:
            for day_idx in range(len(self.dates)):
                for d in self.defs:
                    key = (manager_id, day_idx, d.id)
                    if key not in self.shifts:
                        continue
                    is_morning = d.id in self.morning_def_ids
                    is_weekend = day_idx in self.weekend_day_idxs
                    if not is_morning or is_weekend:
                        self.model.Add(self.shifts[key] == 0)

    def _enforce_fixed_morning_rule(self) -> None:
        """
        HC4: Fixed morning employee is assigned to every Sun–Thu morning slot
        unless they have canWork=false for that specific day.
        """
        for fm_id in self.fixed_morning_ids:
            for day_idx in self.sun_thu_idxs:
                date = self.dates[day_idx]
                for morning_def_id in self.morning_def_ids:
                    key = (fm_id, day_idx, morning_def_id)
                    if key not in self.shifts:
                        continue
                    can = self.avail.get((fm_id, date, morning_def_id), True)
                    if can:
                        self.model.Add(self.shifts[key] == 1)

    def _enforce_minimum_rest(self) -> None:
        """
        HC1: ≥480 minutes between consecutive shifts.
        For night shifts, effective end = next day 06:45 (not ShiftDefinition.endTime).
        For any pair (s1 on day D, s2 on day D+1) where rest_gap < 480:
            AddBoolOr([s1.Not(), s2.Not()])  ← cannot both be 1.
        """
        for w in self.workers:
            for day_idx in range(len(self.dates) - 1):
                for d1 in self.defs:
                    k1 = (w.id, day_idx, d1.id)
                    if k1 not in self.shifts:
                        continue
                    for d2 in self.defs:
                        k2 = (w.id, day_idx + 1, d2.id)
                        if k2 not in self.shifts:
                            continue
                        gap = _rest_gap_minutes(d1, d2)
                        if gap < MIN_REST_MINUTES:
                            self.model.AddBoolOr([
                                self.shifts[k1].Not(),
                                self.shifts[k2].Not(),
                            ])

    def _enforce_weekly_shift_limit(self) -> None:
        """HC6 (strict): No worker may be assigned more than 6 shifts per week."""
        for w in self.workers:
            all_vars = [
                self.shifts[k]
                for k in self.shifts
                if k[0] == w.id
            ]
            if all_vars:
                self.model.Add(sum(all_vars) <= 6)

    def _enforce_weekly_shift_limit_soft(self) -> list[cp_model.LinearExprT]:
        """HC6 (relaxed): Over-6 shifts penalised at W_RELAXED_LOAD per excess."""
        penalties: list[cp_model.LinearExprT] = []
        for w in self.workers:
            all_vars = [self.shifts[k] for k in self.shifts if k[0] == w.id]
            if not all_vars:
                continue
            total = self.model.NewIntVar(0, len(all_vars), f"total_{w.id}")
            self.model.Add(total == sum(all_vars))
            excess = self.model.NewIntVar(0, len(all_vars), f"excess_{w.id}")
            self.model.AddMaxEquality(excess, [total - 6, self.model.NewConstant(0)])
            penalties.append(W_RELAXED_LOAD * excess)
        return penalties

    def _enforce_full_coverage(self) -> None:
        """HC7 (strict): Every slot must meet its requiredCount exactly."""
        for slot in self.slots:
            day_idx = self.date_to_idx[slot.date]
            slot_vars = [
                self.shifts[(w.id, day_idx, slot.definition_id)]
                for w in self.workers
                if (w.id, day_idx, slot.definition_id) in self.shifts
            ]
            if slot_vars:
                self.model.Add(sum(slot_vars) == slot.required_count)

    def _enforce_full_coverage_soft(self) -> list[cp_model.LinearExprT]:
        """HC7 (relaxed): Under-staffed slots penalised at W_RELAXED_COVERAGE per missing head."""
        penalties: list[cp_model.LinearExprT] = []
        for slot in self.slots:
            day_idx = self.date_to_idx[slot.date]
            slot_vars = [
                self.shifts[(w.id, day_idx, slot.definition_id)]
                for w in self.workers
                if (w.id, day_idx, slot.definition_id) in self.shifts
            ]
            if not slot_vars:
                continue
            assigned = self.model.NewIntVar(0, len(slot_vars), f"cov_{slot.id}")
            self.model.Add(assigned == sum(slot_vars))
            # Must assign at least 1 (or required_count if achievable)
            self.model.Add(assigned >= min(1, slot.required_count))
            shortage = self.model.NewIntVar(0, slot.required_count, f"short_{slot.id}")
            self.model.AddMaxEquality(
                shortage,
                [slot.required_count - assigned, self.model.NewConstant(0)],
            )
            penalties.append(W_RELAXED_COVERAGE * shortage)
        return penalties

    # ------------------------------------------------------------------
    # Soft constraints
    # ------------------------------------------------------------------

    def _penalize_shift_imbalance(self) -> list[cp_model.LinearExprT]:
        """
        SHIFT_BALANCE: Each worker's total should not deviate by more than 1
        from the team average. Penalty = W_SHIFT_BALANCE × excess deviation.
        """
        penalties: list[cp_model.LinearExprT] = []
        n_workers = len(self.workers)
        if n_workers == 0:
            return penalties

        total_slots = sum(s.required_count for s in self.slots)
        # Use integer floor of mean to avoid fractional arithmetic in CP-SAT
        mean_floor = total_slots // n_workers

        for w in self.workers:
            all_vars = [self.shifts[k] for k in self.shifts if k[0] == w.id]
            if not all_vars:
                continue
            worker_total = self.model.NewIntVar(0, len(all_vars), f"bal_{w.id}")
            self.model.Add(worker_total == sum(all_vars))
            # Penalty when worker_total > mean_floor + 1
            over = self.model.NewIntVar(0, len(all_vars), f"bal_over_{w.id}")
            self.model.AddMaxEquality(
                over, [worker_total - (mean_floor + 1), self.model.NewConstant(0)]
            )
            penalties.append(W_SHIFT_BALANCE * over)
        return penalties

    def _penalize_type_concentration(self) -> list[cp_model.LinearExprT]:
        """
        TYPE_DIVERSITY: If worker has ≥3 shifts and >60% are same type → penalty.
        Modelled as: if same_type_count > floor(0.6 × worker_total), add penalty.
        We linearize by checking each type independently.
        """
        penalties: list[cp_model.LinearExprT] = []
        type_groups: dict[str, set[str]] = {
            "morning": self.morning_def_ids,
            "afternoon": self.afternoon_def_ids,
            "night": self.night_def_ids,
        }
        for w in self.workers:
            all_vars = [self.shifts[k] for k in self.shifts if k[0] == w.id]
            if len(all_vars) < 3:
                continue
            worker_total = self.model.NewIntVar(0, len(all_vars), f"div_tot_{w.id}")
            self.model.Add(worker_total == sum(all_vars))

            for type_name, def_ids in type_groups.items():
                type_vars = [
                    self.shifts[k]
                    for k in self.shifts
                    if k[0] == w.id and k[2] in def_ids
                ]
                if not type_vars:
                    continue
                type_count = self.model.NewIntVar(0, len(type_vars), f"div_{w.id}_{type_name}")
                self.model.Add(type_count == sum(type_vars))
                # Excess: type_count - floor(0.6 * total)
                # floor(0.6 * x) ≈ (3 * x) // 5; we approximate with integer arithmetic:
                # penalty fires when type_count * 5 > worker_total * 3 + 3 (buffer for ≥3 guard)
                # Introduced as a linearized indicator using AddLinearConstraint bounds
                excess = self.model.NewIntVar(0, len(type_vars), f"div_ex_{w.id}_{type_name}")
                # excess = max(0, type_count - (3 * worker_total) // 5)
                # Approximate: use (type_count * 5 - worker_total * 3) as the excess proxy
                proxy = self.model.NewIntVar(-len(all_vars) * 5, len(all_vars) * 5, f"prx_{w.id}_{type_name}")
                self.model.Add(proxy == type_count * 5 - worker_total * 3)
                self.model.AddMaxEquality(excess, [proxy, self.model.NewConstant(0)])
                penalties.append(W_TYPE_DIVERSITY * excess)
        return penalties

    def _penalize_poor_rest_transitions(self) -> list[cp_model.LinearExprT]:
        """
        REST_OPTIMISATION: Afternoon→Morning next-day transitions that meet the
        8-hour minimum but fall below the preferred 16-hour rest gap → penalty.
        """
        penalties: list[cp_model.LinearExprT] = []
        for w in self.workers:
            for day_idx in range(len(self.dates) - 1):
                for d1 in self.defs:
                    if d1.id not in self.afternoon_def_ids:
                        continue
                    k1 = (w.id, day_idx, d1.id)
                    if k1 not in self.shifts:
                        continue
                    for d2 in self.defs:
                        if d2.id not in self.morning_def_ids:
                            continue
                        k2 = (w.id, day_idx + 1, d2.id)
                        if k2 not in self.shifts:
                            continue
                        gap = _rest_gap_minutes(d1, d2)
                        if MIN_REST_MINUTES <= gap < PREFERRED_REST_MINUTES:
                            # Both assigned → penalty
                            both = self.model.NewBoolVar(f"rest_{w.id}_{day_idx}_{d1.id}_{d2.id}")
                            self.model.AddBoolAnd([self.shifts[k1], self.shifts[k2]]).OnlyEnforceIf(both)
                            self.model.AddBoolOr([self.shifts[k1].Not(), self.shifts[k2].Not()]).OnlyEnforceIf(both.Not())
                            penalties.append(W_REST_OPTIMISATION * both)
        return penalties

    def _penalize_weekend_concentration(self) -> list[cp_model.LinearExprT]:
        """
        WEEKEND_BALANCE: Workers with >avg_weekend + 2 weekend shifts → penalty
        per excess shift.
        """
        penalties: list[cp_model.LinearExprT] = []
        n_workers = len(self.workers)
        if n_workers == 0:
            return penalties

        total_weekend_slots = sum(
            s.required_count
            for s in self.slots
            if self.date_to_idx[s.date] in self.weekend_day_idxs
        )
        avg_weekend_floor = total_weekend_slots // n_workers

        for w in self.workers:
            weekend_vars = [
                self.shifts[k]
                for k in self.shifts
                if k[0] == w.id and k[1] in self.weekend_day_idxs
            ]
            if not weekend_vars:
                continue
            weekend_total = self.model.NewIntVar(0, len(weekend_vars), f"wknd_{w.id}")
            self.model.Add(weekend_total == sum(weekend_vars))
            threshold = avg_weekend_floor + 2
            excess = self.model.NewIntVar(0, len(weekend_vars), f"wknd_ex_{w.id}")
            self.model.AddMaxEquality(
                excess, [weekend_total - threshold, self.model.NewConstant(0)]
            )
            penalties.append(W_WEEKEND_BALANCE * excess)
        return penalties

    def _penalize_night_overload(self) -> list[cp_model.LinearExprT]:
        """Post-gen soft cap: >2 night shifts → penalty per extra night."""
        penalties: list[cp_model.LinearExprT] = []
        for w in self.workers:
            night_vars = [
                self.shifts[k]
                for k in self.shifts
                if k[0] == w.id and k[2] in self.night_def_ids
            ]
            if not night_vars:
                continue
            night_total = self.model.NewIntVar(0, len(night_vars), f"night_{w.id}")
            self.model.Add(night_total == sum(night_vars))
            excess = self.model.NewIntVar(0, len(night_vars), f"night_ex_{w.id}")
            self.model.AddMaxEquality(excess, [night_total - 2, self.model.NewConstant(0)])
            penalties.append(W_NIGHT_OVERCAP * excess)
        return penalties

    def _penalize_friday_saturday_cluster(self) -> list[cp_model.LinearExprT]:
        """Post-gen soft cap: assigned both Friday AND Saturday → penalty."""
        penalties: list[cp_model.LinearExprT] = []
        import datetime

        fri_idxs: list[int] = []
        sat_idxs: list[int] = []
        for date, idx in self.date_to_idx.items():
            dt = datetime.date.fromisoformat(date)
            if dt.weekday() == 4:   # Friday
                fri_idxs.append(idx)
            elif dt.weekday() == 5:  # Saturday
                sat_idxs.append(idx)

        for w in self.workers:
            fri_vars = [
                self.shifts[k]
                for k in self.shifts
                if k[0] == w.id and k[1] in fri_idxs
            ]
            sat_vars = [
                self.shifts[k]
                for k in self.shifts
                if k[0] == w.id and k[1] in sat_idxs
            ]
            if not fri_vars or not sat_vars:
                continue

            has_fri = self.model.NewBoolVar(f"hasfri_{w.id}")
            has_sat = self.model.NewBoolVar(f"hassat_{w.id}")
            fri_sum = self.model.NewIntVar(0, len(fri_vars), f"frisum_{w.id}")
            sat_sum = self.model.NewIntVar(0, len(sat_vars), f"satsum_{w.id}")
            self.model.Add(fri_sum == sum(fri_vars))
            self.model.Add(sat_sum == sum(sat_vars))
            self.model.Add(fri_sum >= 1).OnlyEnforceIf(has_fri)
            self.model.Add(fri_sum == 0).OnlyEnforceIf(has_fri.Not())
            self.model.Add(sat_sum >= 1).OnlyEnforceIf(has_sat)
            self.model.Add(sat_sum == 0).OnlyEnforceIf(has_sat.Not())

            both_wknd = self.model.NewBoolVar(f"frsat_{w.id}")
            self.model.AddBoolAnd([has_fri, has_sat]).OnlyEnforceIf(both_wknd)
            self.model.AddBoolOr([has_fri.Not(), has_sat.Not()]).OnlyEnforceIf(both_wknd.Not())
            penalties.append(W_FRI_SAT_CLUSTER * both_wknd)
        return penalties

    # ------------------------------------------------------------------
    # Result extraction
    # ------------------------------------------------------------------

    def _extract_assignments(self) -> list[AssignmentOut]:
        assignments: list[AssignmentOut] = []
        for (w_id, day_idx, def_id), var in self.shifts.items():
            if self._solver.Value(var) == 1:
                date = self.dates[day_idx]
                slot = self.slot_by_key.get((date, def_id))
                if slot:
                    assignments.append(
                        AssignmentOut(shift_id=slot.id, worker_id=w_id)
                    )
        return assignments

    def _collect_violations(
        self, assignments: list[AssignmentOut], relaxed: bool
    ) -> list[Violation]:
        violations: list[Violation] = []

        # FULL_COVERAGE check
        assigned_counts: dict[str, int] = defaultdict(int)
        for a in assignments:
            assigned_counts[a.shift_id] += 1

        for slot in self.slots:
            count = assigned_counts.get(slot.id, 0)
            if count < slot.required_count:
                label = "FULL_COVERAGE" if not relaxed else "FULL_COVERAGE (relaxed)"
                violations.append(
                    Violation(
                        constraint_id=label,
                        shift_id=slot.id,
                        message=(
                            f"Slot {slot.date}/{slot.definition_id}: "
                            f"required {slot.required_count}, assigned {count}."
                        ),
                    )
                )

        # MAXIMUM_LOAD check (only relevant in relaxed mode)
        if relaxed:
            worker_counts: dict[str, int] = defaultdict(int)
            for a in assignments:
                worker_counts[a.worker_id] += 1
            for w_id, cnt in worker_counts.items():
                if cnt > 6:
                    violations.append(
                        Violation(
                            constraint_id="MAXIMUM_LOAD (relaxed)",
                            worker_id=w_id,
                            message=f"Worker {w_id} assigned {cnt} shifts (limit 6, relaxed).",
                        )
                    )

        return violations

    def _collect_warnings(self, assignments: list[AssignmentOut]) -> list[Warning]:
        import datetime

        warnings: list[Warning] = []

        worker_counts: dict[str, int] = defaultdict(int)
        worker_night_counts: dict[str, int] = defaultdict(int)
        worker_weekend_counts: dict[str, int] = defaultdict(int)
        worker_fri: dict[str, bool] = defaultdict(bool)
        worker_sat: dict[str, bool] = defaultdict(bool)
        worker_type_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for a in assignments:
            worker_counts[a.worker_id] += 1
            # Derive type and day from slot
            slot = next((s for s in self.slots if s.id == a.shift_id), None)
            if slot is None:
                continue
            def_id = slot.definition_id
            day_idx = self.date_to_idx.get(slot.date, -1)

            if def_id in self.night_def_ids:
                worker_night_counts[a.worker_id] += 1
                worker_type_counts[a.worker_id]["night"] += 1
            elif def_id in self.afternoon_def_ids:
                worker_type_counts[a.worker_id]["afternoon"] += 1
            else:
                worker_type_counts[a.worker_id]["morning"] += 1

            if day_idx in self.weekend_day_idxs:
                worker_weekend_counts[a.worker_id] += 1
                dt = datetime.date.fromisoformat(slot.date)
                if dt.weekday() == 4:
                    worker_fri[a.worker_id] = True
                elif dt.weekday() == 5:
                    worker_sat[a.worker_id] = True

        total_workers = len(self.workers)
        total_shifts = sum(worker_counts.values())
        avg_shifts = total_shifts / total_workers if total_workers else 0
        avg_weekend = (
            sum(worker_weekend_counts.values()) / total_workers if total_workers else 0
        )

        for w_id in set(worker_counts) | set(worker_night_counts):
            # SHIFT_BALANCE
            cnt = worker_counts.get(w_id, 0)
            if abs(cnt - avg_shifts) > 1:
                warnings.append(
                    Warning(
                        constraint_id="SHIFT_BALANCE",
                        worker_id=w_id,
                        message=f"Worker {w_id} has {cnt} shifts vs team avg {avg_shifts:.1f}.",
                    )
                )

            # Night overcap
            if worker_night_counts.get(w_id, 0) > 2:
                warnings.append(
                    Warning(
                        constraint_id="NIGHT_OVERCAP",
                        worker_id=w_id,
                        message=f"Worker {w_id} has {worker_night_counts[w_id]} night shifts (>2).",
                    )
                )

            # Fri+Sat cluster
            if worker_fri.get(w_id) and worker_sat.get(w_id):
                warnings.append(
                    Warning(
                        constraint_id="FRI_SAT_CLUSTER",
                        worker_id=w_id,
                        message=f"Worker {w_id} is assigned both Friday and Saturday.",
                    )
                )

            # WEEKEND_BALANCE
            wknd = worker_weekend_counts.get(w_id, 0)
            if wknd > avg_weekend + 2:
                warnings.append(
                    Warning(
                        constraint_id="WEEKEND_BALANCE",
                        worker_id=w_id,
                        message=(
                            f"Worker {w_id} has {wknd} weekend shifts "
                            f"vs team avg {avg_weekend:.1f}."
                        ),
                    )
                )

            # TYPE_DIVERSITY
            type_map = worker_type_counts.get(w_id, {})
            total_w = worker_counts.get(w_id, 0)
            if total_w >= 3:
                for type_name, type_cnt in type_map.items():
                    if type_cnt / total_w > 0.6:
                        warnings.append(
                            Warning(
                                constraint_id="TYPE_DIVERSITY",
                                worker_id=w_id,
                                message=(
                                    f"Worker {w_id}: {type_cnt}/{total_w} shifts "
                                    f"are {type_name} ({type_cnt/total_w:.0%})."
                                ),
                            )
                        )

        return warnings
