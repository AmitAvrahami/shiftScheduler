"""Cross-runtime solver contract tests.

These tests verify that the Pydantic models in `models.py` can parse the
shared JSON fixtures under `backend/__fixtures__/`. The same fixtures are
parsed by the Node TypeScript contract test, so any drift between the two
runtimes will surface as a failure on one side.
"""
from __future__ import annotations

import json
from pathlib import Path

from models import SolveRequest, SolveResult

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "__fixtures__"


def _load(filename: str) -> dict:
    with (FIXTURES_DIR / filename).open(encoding="utf-8") as f:
        return json.load(f)


def test_valid_solve_request_parses() -> None:
    raw = _load("valid_solve_request.json")
    req = SolveRequest.model_validate(raw)

    assert req.schedule_id == "schedule_contract_test"
    assert req.week_id == "2026-W18"
    assert req.workers[0].role == "employee"
    assert req.shift_definitions[0].shift_type == "morning"
    assert req.shift_definitions[0].start_time == "06:00"
    assert req.shifts[0].required_count == 1


def test_legacy_request_without_shift_type_parses() -> None:
    """A pre-shift_type payload must still parse; shift_type defaults to None
    so the solver can fall back to name-substring classification."""
    raw = _load("valid_solve_request.json")
    for d in raw["shift_definitions"]:
        d.pop("shift_type", None)

    req = SolveRequest.model_validate(raw)

    assert req.shift_definitions[0].shift_type is None


def test_valid_solve_request_parses_with_generic_payload_fields() -> None:
    """PR #3 — the SolveRequest model accepts the additive generic payload
    fields produced by the Node compiler. This test verifies parsing only."""
    raw = _load("valid_solve_request.json")
    raw["forbidden_assignments"] = [{"worker_id": "worker_1", "shift_id": "shift_1"}]
    raw["penalties"] = [
        {"category": "shift_balance", "weight": 10, "worker_id": "worker_1"},
        {"category": "weekend_balance", "weight": 5},
    ]
    raw["relaxation_weights"] = {"load": 10000, "coverage": 10000}

    req = SolveRequest.model_validate(raw)

    assert len(req.forbidden_assignments) == 1
    assert req.forbidden_assignments[0].worker_id == "worker_1"
    assert req.forbidden_assignments[0].shift_id == "shift_1"

    assert len(req.penalties) == 2
    assert req.penalties[0].category == "shift_balance"
    assert req.penalties[0].weight == 10
    assert req.penalties[1].worker_id is None

    assert req.relaxation_weights is not None
    assert req.relaxation_weights.load == 10000
    assert req.relaxation_weights.coverage == 10000


def test_valid_solve_request_parses_without_generic_payload_fields() -> None:
    """A pre-PR-3 payload (no generic fields) must still parse — defaults
    fill the gap so the model stays backward-compatible."""
    raw = _load("valid_solve_request.json")

    req = SolveRequest.model_validate(raw)

    assert req.forbidden_assignments == []
    assert req.penalties == []
    assert req.relaxation_weights is None


def test_valid_solve_result_parses() -> None:
    raw = _load("valid_solve_result.json")
    result = SolveResult.model_validate(raw)

    assert result.status == "FEASIBLE"
    assert result.assignments[0].assigned_by == "algorithm"
    assert result.warnings[0].constraint_id == "CONTRACT_TEST_WARNING"
    assert result.solve_time_ms == 12


def test_legacy_warning_without_structured_fields_parses() -> None:
    """PR09 — a warning lacking the new type/severity/shift_ids fields must
    still parse; defaults fill the gap so the model stays backward-compatible."""
    raw = _load("valid_solve_result.json")
    for w in raw["warnings"]:
        w.pop("type", None)
        w.pop("severity", None)
        w.pop("shift_ids", None)

    result = SolveResult.model_validate(raw)

    warning = result.warnings[0]
    assert warning.type == ""
    assert warning.severity == "warning"
    assert warning.shift_ids == []


def test_structured_warning_fields_round_trip() -> None:
    """PR09 — the additive structured warning fields parse when present."""
    raw = _load("valid_solve_result.json")
    raw["warnings"][0].update(
        {
            "type": "ASSIGNMENT_PREFERENCE",
            "severity": "warning",
            "shift_ids": ["shift_1", "shift_2"],
        }
    )

    result = SolveResult.model_validate(raw)

    warning = result.warnings[0]
    assert warning.type == "ASSIGNMENT_PREFERENCE"
    assert warning.severity == "warning"
    assert warning.shift_ids == ["shift_1", "shift_2"]
