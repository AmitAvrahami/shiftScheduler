"""HTTP validation tests for the /solve endpoint.

These exercise the FastAPI routing and request validation paths in main.py
without invoking the CP-SAT solver. Full solver behavior is covered by
test_shift_solver.py.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _base_payload() -> dict:
    """A schema-valid SolveRequest body with all three list fields populated.

    The CP-SAT solver is never reached because each test mutates one of the
    lists to empty (triggering main.py's 422 guard) before posting.
    """
    return {
        "schedule_id": "sched_smoke",
        "week_id": "2026-W18",
        "workers": [
            {
                "id": "w1",
                "role": "employee",
                "is_fixed_morning": False,
                "availability": [],
            }
        ],
        "shift_definitions": [
            {
                "id": "def_morning",
                "name": "Morning",
                "start_time": "06:00",
                "end_time": "14:00",
                "duration_minutes": 480,
                "crosses_midnight": False,
            }
        ],
        "shifts": [
            {
                "id": "slot_1",
                "date": "2026-04-26",
                "definition_id": "def_morning",
                "required_count": 1,
            }
        ],
    }


def test_solve_rejects_empty_workers():
    payload = _base_payload()
    payload["workers"] = []
    response = client.post("/solve", json=payload)
    assert response.status_code == 422
    assert "workers" in response.json().get("detail", "").lower()


def test_solve_rejects_empty_shifts():
    payload = _base_payload()
    payload["shifts"] = []
    response = client.post("/solve", json=payload)
    assert response.status_code == 422
    assert "shifts" in response.json().get("detail", "").lower()


def test_solve_rejects_empty_shift_definitions():
    payload = _base_payload()
    payload["shift_definitions"] = []
    response = client.post("/solve", json=payload)
    assert response.status_code == 422
    assert "shift_definitions" in response.json().get("detail", "").lower()


def test_solve_rejects_empty_object():
    response = client.post("/solve", json={})
    assert response.status_code == 422


def test_solve_rejects_unknown_payload():
    response = client.post("/solve", json={"foo": "bar"})
    assert response.status_code == 422


def test_solve_rejects_wrong_field_types():
    payload = _base_payload()
    payload["workers"] = "not-a-list"
    response = client.post("/solve", json=payload)
    assert response.status_code == 422
