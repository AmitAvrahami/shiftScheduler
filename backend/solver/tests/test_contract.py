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
    assert req.shift_definitions[0].start_time == "06:00"
    assert req.shifts[0].required_count == 1


def test_valid_solve_result_parses() -> None:
    raw = _load("valid_solve_result.json")
    result = SolveResult.model_validate(raw)

    assert result.status == "FEASIBLE"
    assert result.assignments[0].assigned_by == "algorithm"
    assert result.warnings[0].constraint_id == "CONTRACT_TEST_WARNING"
    assert result.solve_time_ms == 12
