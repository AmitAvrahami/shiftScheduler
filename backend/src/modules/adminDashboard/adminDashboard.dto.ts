import type { Types } from 'mongoose';

// ─── Workflow state ───────────────────────────────────────────────────────────
// Canonical UI-facing state derived from WeeklySchedule.status.
//   'open'       → 'constraints_open'
//   'locked'     → 'constraints_locked'
//   'generating' → 'draft'   (transient; treat as draft for UI)
//   'draft'      → 'draft'
//   'published'  → 'published'
//   'archived'   → 'archived'
//   (no doc)     → 'not_created'
export type WeekWorkflowState =
  | 'not_created'
  | 'constraints_open'
  | 'constraints_locked'
  | 'draft'
  | 'published'
  | 'archived';

// TODO: once ShiftDefinition adds a typed 'shiftType' enum field, derive directly
// from that field instead of heuristic name/time matching.
export type ShiftTypeDTO = 'morning' | 'afternoon' | 'night' | 'unknown';

// ─── Public DTO ──────────────────────────────────────────────────────────────

export interface EmployeeDTO {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  isFixedMorningEmployee?: boolean;
}

export interface ShiftDTO {
  id: string;
  day: string;              // YYYY-MM-DD local time
  type: ShiftTypeDTO;
  requiredEmployees: number;
  // TODO: add templateStatus once WeeklySchedule tracks per-template generation state
}

export interface AssignmentDTO {
  id: string;
  shiftId: string;
  employeeId: string;
}

export interface MissingConstraintDTO {
  id: string;
  name: string;
}

export interface KpisDTO {
  totalShifts: number;
  filledShifts: number;          // shifts where actual assignments >= requiredEmployees
  missingAssignments: number;    // sum of max(0, required - actual) per shift
  employeesMissingConstraints: number;
}

export interface ReadinessDTO {
  canGenerate: boolean;          // true when state is 'constraints_locked' or 'draft'
  hasMissingConstraints: boolean;
  hasNoEmployees: boolean;
  hasNoShifts: boolean;
  warnings: string[];
}

export interface AuditLogDTO {
  id: string;
  action: string;
  createdAt: Date;
}

export interface AdminDashboardDTO {
  weekId: string;
  scheduleId: string | null;
  scheduleStatus: WeekWorkflowState;
  employees: EmployeeDTO[];
  shifts: ShiftDTO[];
  assignments: AssignmentDTO[];
  missingConstraints: MissingConstraintDTO[];
  kpis: KpisDTO;
  readiness: ReadinessDTO;
  auditLogs: AuditLogDTO[];
}

// ─── Raw internal types (lean Mongo docs passed from service → mapper) ────────

export interface RawScheduleDoc {
  _id: Types.ObjectId;
  weekId: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export interface RawUserDoc {
  _id: Types.ObjectId;
  name: string;
  role: string;
  isActive: boolean;
  isFixedMorningEmployee?: boolean;
}

export interface RawShiftDoc {
  _id: Types.ObjectId;
  scheduleId: Types.ObjectId;
  definitionId: Types.ObjectId;
  date: Date;
  startTime: string;   // "HH:MM" — used for type derivation fallback
  requiredCount: number;
  status: string;
}

export interface RawShiftDefDoc {
  _id: Types.ObjectId;
  name: string;
  startTime: string;   // "HH:MM"
}

export interface RawAssignmentDoc {
  _id: Types.ObjectId;
  shiftId: Types.ObjectId;
  userId: Types.ObjectId;
  scheduleId: Types.ObjectId;
}

export interface RawConstraintDoc {
  userId: Types.ObjectId;
}

export interface RawAuditLogDoc {
  _id: Types.ObjectId;
  action: string;
  createdAt: Date;
}

export interface AdminDashboardRaw {
  weekId: string;
  schedule: RawScheduleDoc | null;
  employees: RawUserDoc[];
  shiftDefinitions: RawShiftDefDoc[];
  shifts: RawShiftDoc[];
  assignments: RawAssignmentDoc[];
  constraintUserIds: string[];   // userIds who submitted constraints for this weekId
  auditLogs: RawAuditLogDoc[];   // scoped to week date range; empty if none found
}
