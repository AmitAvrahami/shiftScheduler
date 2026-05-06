# CSP Algorithm

This document describes the Constraint Satisfaction Problem (CSP) engine that generates weekly shift schedules.

---

## Problem Definition

| Element              | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Variables**        | Each shift slot in the week (date + shift definition). 7 days × 3 shifts = **21 slots**.     |
| **Domain**           | For each slot: the set of active employees eligible to work that slot.                       |
| **Hard constraints** | Absolute rules that must hold. See `docs/CONSTRAINTS.md`.                                    |
| **Soft constraints** | Scoring rules that minimise solution cost. See `docs/CONSTRAINTS.md`.                        |
| **Objective**        | Find a complete assignment with **zero hard violations** and **minimum soft penalty score**. |

---

## Algorithm Flow (9 Steps)

```
schedulerService.ts → cspScheduler.ts
```

1. **Load data** — fetch all active employees, their constraints for the target `weekId`, and all active shift definitions.

2. **Pre-assign fixed slots**
   - Place the **manager** in all morning slots (every day).
   - Place the **fixed morning employee** in Sunday–Thursday morning slots. Skip any day where the employee has `canWork: false`.

3. **Sort remaining slots by difficulty** — fewest eligible employees first (**MRV — Minimum Remaining Values** heuristic). Harder slots are filled first to reduce the risk of dead-ends.

4. **For each slot, compute the eligible employee set** — employees who pass all three checks:
   - `EMPLOYEE_BLOCK`: no `canWork: false` constraint for this slot.
   - `MINIMUM_REST`: ≥ 480 minutes since their last shift ended.
   - `MAXIMUM_LOAD`: fewer than 6 shifts already assigned this week.

5. **Select the best candidate** from the eligible set — the employee with the **lowest current soft-penalty score** (**LCV — Least Constraining Value** heuristic). Break ties **randomly** to introduce schedule variety across re-generations.

6. **Assign and advance** — record the assignment and move to the next slot. If the eligible set is **empty**, mark the slot as `empty` and continue (partial schedule; do not abort).

7. **Validate hard constraints** — run `validateHardConstraints()` on the complete schedule. Produce `violations[]`.

8. **Analyse soft constraints** — run `analyzeSoftConstraints()` on the complete schedule. Produce `warnings[]`.

9. **Return** `{ schedule, violations[], warnings[] }`.

---

## Fairness Scoring (`calculateEmployeeScore()` in `cspScheduler.ts`)

Used in step 5 to rank candidates. **Lower score = better candidate** (more balanced, less loaded).

Linear penalty formula:

| Condition                                                                      | Penalty |
| ------------------------------------------------------------------------------ | ------- |
| Per total shift assigned this week                                             | **+10** |
| Per night shift assigned this week                                             | **+20** |
| Friday + Saturday clustering (only when employee already has >1 weekend shift) | **+30** |

**Why linear?** Quadratic penalties (e.g. `2 × nightShifts²`) are too weak at low shift counts and too aggressive at high counts. Linear penalties provide a consistent, predictable gradient.

---

## Post-Generation Soft-Cap Warnings

After step 8, additional warnings are appended to `warnings[]` (non-blocking):

- Employee assigned **more than 2 night shifts** in the week.
- Employee assigned **both Friday AND Saturday** shifts in the same week.

These appear in the manager's warnings panel without blocking publication.

---

## Key Properties

| Property               | Value                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Idempotency**        | Re-running generation for the same `weekId` replaces the current draft. Constraints and employees are re-loaded fresh each time.           |
| **Partial schedules**  | The engine never aborts. If a slot cannot be filled, it is marked `empty` and returned as a hard violation. The manager fills it manually. |
| **Performance target** | ≤ 5 seconds for 10 employees and 21 slots on a standard cloud instance.                                                                    |
| **Variety**            | Random tie-breaking in step 5 means successive re-generations can produce different valid schedules.                                       |
