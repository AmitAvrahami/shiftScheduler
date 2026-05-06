# Constraints

This document defines all hard and soft constraints used by the scheduling engine and the manual-edit validation layer.

---

## Hard Constraints

Hard constraints are **absolute rules**. A schedule containing any hard violation **cannot be published**. The generation endpoint returns all violations in a `violations[]` array. All violations must be resolved (by editing or re-generating) before the manager can click Publish.

| ID                   | Rule                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MINIMUM_REST`       | An employee must have at least **480 minutes (8 hours)** between the end of one shift and the start of the next. Night shifts end at **06:45 of the following calendar day** — this must be used as the end-time anchor, not the nominal shift end. |
| `EMPLOYEE_BLOCK`     | An employee with `canWork: false` for a given date/shift combination must not be assigned to that slot.                                                                                                                                             |
| `MANAGER_RULE`       | The manager is assigned **only** to morning shifts. No other shift type is permitted for the manager.                                                                                                                                               |
| `FIXED_MORNING_RULE` | The fixed morning employee is assigned to every **Sunday–Thursday morning shift**, unless they have a documented `canWork: false` constraint for that specific day (dynamic waiver).                                                                |
| `MAXIMUM_LOAD`       | No employee may be assigned more than **6 shifts** in a single week.                                                                                                                                                                                |
| `FULL_COVERAGE`      | Every shift must meet its `requiredCount`. Slots that cannot be filled are flagged as `partial` (under-staffed) or `empty` (zero employees) and returned as violations.                                                                             |

---

## Soft Constraints

Soft constraints **improve schedule quality**. Violations produce entries in the `warnings[]` array returned by the generation endpoint. They are **advisory and non-blocking** — the manager can acknowledge them and proceed to publish.

| ID                  | Rule                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHIFT_BALANCE`     | Each employee's total shift count should not deviate by more than **1** from the team average.                                                                                   |
| `TYPE_DIVERSITY`    | No employee should have more than **60%** of their weekly shifts of the same type (morning / afternoon / night) when they have **3 or more** shifts that week.                   |
| `REST_OPTIMISATION` | An Afternoon → next-day Morning transition (exactly 480 min gap) is **legal** but sub-optimal. The engine prefers assignments that provide **≥ 960 minutes (16 hours)** of rest. |
| `WEEKEND_BALANCE`   | Weekend shifts (Friday–Saturday) should be distributed evenly. An employee with **2 or more** weekend shifts above the team average triggers a warning.                          |

### Post-generation soft-cap warnings

These additional warnings fire after the full schedule is assembled (non-blocking):

- Employee assigned **more than 2 night shifts** in the week.
- Employee assigned **both Friday AND Saturday** shifts.

---

## Manual Edit Validation

Every drag-and-drop action on the schedule editor calls:

```
POST /api/v1/schedules/:weekId/validate
```

with the proposed change before the UI commits it. The response contains `hardViolations[]` and `softWarnings[]`.

| Outcome        | Behavior                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Hard violation | Change is **automatically reverted**. An error toast is shown. No modal. No data is persisted.                                             |
| Soft warning   | A **confirmation modal** is shown. If the manager confirms, the warning is appended to the session warnings panel and the change is saved. |
| No issues      | Change is committed immediately.                                                                                                           |

All edits to a **published** schedule are tracked in the AuditLog with before/after snapshots (see `docs/WEEKLY_FLOW.md`).
