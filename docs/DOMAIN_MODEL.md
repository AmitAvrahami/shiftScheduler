# Domain Model

This document describes the core entities, roles, and business rules that shape the ShiftScheduler data model.

---

## Roles

Three roles exist on the `User` document. Role is checked on every API request.

| Role | Capabilities |
| ---- | ------------ |
| `employee` | Log in, submit constraints, view personal schedule, receive notifications |
| `manager` | Everything `employee` can do, plus: create/deactivate accounts, generate/edit/publish schedules, override constraints, view audit log, approve swaps (Phase 2) |
| `admin` | Everything `manager` can do, plus: manage shift definitions, configure system-wide settings |

**Self-registration is disabled.** Only a manager can create new accounts.

**Account deactivation** preserves all historical data. Deactivated employees cannot log in and do not appear in the eligibility pool for new schedules.

**JWT tokens** expire after 24 hours. Passwords are hashed with bcrypt (minimum 10 rounds).

---

## Special Role: Fixed Morning Employee (עובד בוקר קבוע)

This is a **boolean property on the User document**, not a separate role.

Rules:
- The fixed morning employee is **automatically pre-assigned** to every **Sunday–Thursday morning shift** during schedule generation.
- The pre-assignment is **dynamically waived** if the employee has a `canWork: false` constraint for that specific day.
- Friday and Saturday morning shifts are **not** subject to the fixed rule — the employee competes for those slots normally.

The manager is also pre-assigned to all morning shifts (see `MANAGER_RULE` in `docs/CONSTRAINTS.md`).

---

## Shift Definitions

Shift definitions are **stored in the database**, not hardcoded. This allows the admin to configure custom shift types without code changes.

### Default definitions (seeded on first run)

| Name | Start | End | Days | Required staff | `crossesMidnight` | Notes |
| ---- | ----- | --- | ---- | -------------- | ----------------- | ----- |
| Morning (בוקר) | 06:45 | 14:45 | 0-6 | 2 | `false` | Manager + fixed morning employee pre-assigned |
| Afternoon (אחהצ) | 14:45 | 22:45 | 0-6 | 2 | `false` | |
| Night (לילה) | 22:45 | 06:45+1 | 0-6 | 1 | `true` | Ends at 06:45 the following calendar day |

### Shift definition schema fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | `string` | Display name (Hebrew) |
| `startTime` | `HH:MM` | Shift start in local time |
| `endTime` | `HH:MM` | Shift end in local time |
| `daysOfWeek` | `number[]` | Recurrence days, where Sunday is `0` and Saturday is `6` |
| `durationMinutes` | `number` | Total shift length in minutes |
| `crossesMidnight` | `boolean` | True when end time is on the following calendar day |
| `color` | `string` | Hex colour for UI rendering |
| `requiredStaffCount` | `number` | Minimum number of employees needed for each generated instance |
| `isActive` | `boolean` | Inactive definitions cannot be used in new schedules |

**Deactivated definitions** remain attached to historical schedules (data integrity) but are excluded from the eligible pool when generating new schedules.

### Shift instances

Generated and manually created shifts store a reference to their template as `definitionId`. API payloads may use `shiftDefinitionId` as an alias for that same reference.

Each shift also stores snapshot `startTime` and `endTime` values copied from the `ShiftDefinition` at creation time. Later edits to a shift definition do not move historical shift instances.

---

## Schedule States

```
draft → published
```

| State | Description |
| ----- | ----------- |
| `draft` | Generated but not yet visible to employees. Manager can re-generate or edit freely. |
| `published` | Visible to all employees. Further edits are tracked in the AuditLog. |

- Generation is **idempotent** per `weekId` — re-running replaces the current draft.
- The manager can re-generate as many times as needed before publishing.
- After publishing, the manager can still edit or re-generate; all changes are audit-logged.
- Hard constraint violations **must all be resolved** before the schedule can be published (see `docs/CONSTRAINTS.md`).

---

## Week Identity

Each schedule is keyed by a `weekId` in ISO week format (e.g., `2026-W11`). The week runs **Sunday through Saturday** (IST). All date keys within a schedule use local-time `YYYY-MM-DD` strings — never UTC ISO strings.
