# Weekly Flow

This document describes the fixed weekly cadence, deadline enforcement mechanics, notification events, and audit log rules.

---

## Weekly Cadence

The system is designed around a fixed weekly workflow. Every stakeholder has a defined window of action.

| Day                  | Actor     | Action                                                               | System state             |
| -------------------- | --------- | -------------------------------------------------------------------- | ------------------------ |
| **Sunday**           | Employees | Submit constraints for the upcoming week via the 7×3 grid            | Constraint window open   |
| **Monday 23:59 IST** | System    | Deadline passes; all constraint forms are automatically locked       | Constraint window locked |
| **Tuesday AM**       | Manager   | Reviews constraint table; clicks **Generate Schedule**               | Draft schedule created   |
| **Tuesday AM**       | Manager   | Reviews violations and warnings; edits via drag-and-drop if needed   | Draft schedule editing   |
| **Tuesday PM**       | Manager   | Clicks **Publish**                                                   | Schedule published       |
| **Wed–Sat**          | Employees | View their personal published schedule                               | Schedule live            |
| **Any time**         | Manager   | Can override constraints, re-generate, or edit even after publishing | AuditLog updated         |

**Target publish deadline:** Wednesday 09:00 IST.

---

## Constraint Submission Window

- **Opens:** Sunday (start of week)
- **Closes:** Monday **23:59:59 IST** (UTC+3)
- **UI:** 7-column × 3-shift grid, one checkbox per cell. Autosave on every change.

### After the deadline

| Actor        | Behavior                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Employee** | UI disables all inputs and shows a clear banner. Backend returns `403 Forbidden` on any submission attempt.                                                            |
| **Manager**  | Override bypasses the deadline check. Creates an **AuditLog** entry (`constraint_override`). Sends a **Notification** (`constraint_updated`) to the affected employee. |

Each constraint document is versioned with a `submittedVia` field: `'self'` or `'manager_override'`.

---

## Notifications

In-app notification bell with unread count badge. Each notification links to the relevant object (schedule, constraint form, or swap request).

| Event                | Trigger                                      |
| -------------------- | -------------------------------------------- |
| `schedule_published` | Manager publishes a schedule                 |
| `schedule_updated`   | Manager edits a published schedule           |
| `schedule_deleted`   | Schedule is deleted                          |
| `constraint_updated` | Manager overrides an employee's constraints  |
| `swap_request`       | Employee receives a swap request _(Phase 2)_ |
| `swap_approved`      | Swap request is approved _(Phase 2)_         |
| `swap_rejected`      | Swap request is rejected _(Phase 2)_         |

---

## Audit Log

Every state-changing action writes an AuditLog entry containing: **who**, **what**, **when**, and **before/after snapshots**.

The audit log is **read-only**. Accessible to `manager` and `admin` roles only.

### Logged events

| Event                      | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `constraint_override`      | Manager submits or changes an employee's constraints after the deadline |
| `assignment_edit`          | Manager drags and drops an employee on the schedule editor              |
| `swap_approved`            | Manager approves a shift swap request _(Phase 2)_                       |
| `schedule_published`       | Manager publishes a draft schedule                                      |
| `user_created`             | Manager creates a new employee account                                  |
| `user_deactivated`         | Manager deactivates an existing account                                 |
| `shift_definition_changed` | Admin creates, edits, or deactivates a shift definition _(Phase 2)_     |
| `setting_changed`          | Admin updates a system-wide configuration parameter _(Phase 2)_         |
