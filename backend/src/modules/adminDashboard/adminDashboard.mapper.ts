import { toDateKey } from '../../utils/weekUtils';
import type {
  AdminDashboardRaw,
  AdminDashboardDTO,
  WeekWorkflowState,
  ShiftTypeDTO,
  RawShiftDoc,
  RawShiftDefDoc,
} from './adminDashboard.dto';

// ─── Schedule status mapping ──────────────────────────────────────────────────

function mapScheduleStatus(rawStatus: string | undefined): WeekWorkflowState {
  if (!rawStatus) return 'not_created';
  const map: Record<string, WeekWorkflowState> = {
    open:       'constraints_open',
    locked:     'constraints_locked',
    generating: 'draft',   // transient state — surface as draft to the UI
    draft:      'draft',
    published:  'published',
    archived:   'archived',
  };
  return map[rawStatus] ?? 'not_created';
}

// ─── Shift type derivation ────────────────────────────────────────────────────

// Step 1: match definition name (English + Hebrew common terms).
function typeFromName(name: string): ShiftTypeDTO | null {
  const n = name.toLowerCase();
  if (n.includes('morning') || n.includes('בוקר')) return 'morning';
  if (
    n.includes('afternoon') ||
    n.includes('צהריים') ||
    n.includes('ערב') ||    // evening / afternoon in common IST usage
    n.includes('אחה"צ')
  ) return 'afternoon';
  if (n.includes('night') || n.includes('לילה')) return 'night';
  return null;
}

// Step 2: derive from "HH:MM" start time.
// morning  [06:00, 14:00)
// afternoon [14:00, 22:00)
// night    [22:00, 06:00)  — wraps midnight
function typeFromStartTime(startTime: string): ShiftTypeDTO | null {
  const parts = startTime.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  if (isNaN(hours)) return null;
  if (hours >= 6 && hours < 14) return 'morning';
  if (hours >= 14 && hours < 22) return 'afternoon';
  if (hours >= 22 || hours < 6) return 'night';
  return null;
}

function deriveShiftType(
  shift: RawShiftDoc,
  defById: Map<string, RawShiftDefDoc>,
): ShiftTypeDTO {
  const def = defById.get(String(shift.definitionId));

  if (def) {
    const fromName = typeFromName(def.name);
    if (fromName) return fromName;

    const fromDefTime = typeFromStartTime(def.startTime);
    if (fromDefTime) return fromDefTime;
  }

  // Fall back to the shift's own startTime (set by pre-validate hook on Shift model)
  if (shift.startTime) {
    const fromShiftTime = typeFromStartTime(shift.startTime);
    if (fromShiftTime) return fromShiftTime;
  }

  // TODO: ShiftDefinition lacks a typed 'shiftType' enum field.
  // Once that field is added, use it as the primary source here.
  return 'unknown';
}

// ─── Main mapper ──────────────────────────────────────────────────────────────

export function toAdminDashboardDTO(raw: AdminDashboardRaw): AdminDashboardDTO {
  const scheduleStatus = mapScheduleStatus(raw.schedule?.status);

  // Build definition lookup map once
  const defById = new Map<string, RawShiftDefDoc>(
    raw.shiftDefinitions.map((d) => [String(d._id), d]),
  );

  // ── Employees ──────────────────────────────────────────────────────────────
  const employees = raw.employees.map((u) => ({
    id: String(u._id),
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    isFixedMorningEmployee: Boolean(u.isFixedMorningEmployee),
  }));

  // ── Shifts ────────────────────────────────────────────────────────────────
  const shifts = raw.shifts.map((s) => ({
    id: String(s._id),
    day: toDateKey(new Date(s.date)),   // local-time YYYY-MM-DD, no ISO-string split
    type: deriveShiftType(s, defById),
    requiredEmployees: s.requiredCount,
  }));

  // ── Assignments ───────────────────────────────────────────────────────────
  const assignments = raw.assignments.map((a) => ({
    id: String(a._id),
    shiftId: String(a.shiftId),
    employeeId: String(a.userId),
  }));

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Build shiftId → actual assignment count
  const assignmentCountByShift = new Map<string, number>();
  for (const a of raw.assignments) {
    const key = String(a.shiftId);
    assignmentCountByShift.set(key, (assignmentCountByShift.get(key) ?? 0) + 1);
  }

  const filledShifts = raw.shifts.filter((s) => {
    const actual = assignmentCountByShift.get(String(s._id)) ?? 0;
    return actual >= s.requiredCount;
  }).length;

  const missingAssignments = raw.shifts.reduce((acc, s) => {
    const actual = assignmentCountByShift.get(String(s._id)) ?? 0;
    return acc + Math.max(0, s.requiredCount - actual);
  }, 0);

  // ── Missing constraints ───────────────────────────────────────────────────
  const submittedSet = new Set(raw.constraintUserIds);
  const missingConstraintUsers = raw.employees.filter(
    (e) => e.role === 'employee' && !submittedSet.has(String(e._id)),
  );

  const missingConstraints = missingConstraintUsers.map((u) => ({
    id: String(u._id),
    name: u.name,
  }));

  // ── Readiness ─────────────────────────────────────────────────────────────
  const canGenerate =
    scheduleStatus === 'constraints_locked' || scheduleStatus === 'draft';

  const hasMissingConstraints = missingConstraintUsers.length > 0;
  const hasNoEmployees = employees.length === 0;
  const hasNoShifts = shifts.length === 0;

  const warnings: string[] = [];
  if (hasMissingConstraints) {
    warnings.push(
      `${missingConstraintUsers.length} employees have not submitted constraints`,
    );
  }
  if (hasNoEmployees) {
    warnings.push('No active employees found');
  }
  if (hasNoShifts && scheduleStatus !== 'not_created') {
    warnings.push('No shifts defined for this week');
  }

  // ── Audit logs ────────────────────────────────────────────────────────────
  const auditLogs = raw.auditLogs.map((l) => ({
    id: String(l._id),
    action: l.action,
    createdAt: l.createdAt,
  }));

  return {
    weekId: raw.weekId,
    scheduleId: raw.schedule ? String(raw.schedule._id) : null,
    scheduleStatus,
    employees,
    shifts,
    assignments,
    missingConstraints,
    kpis: {
      totalShifts: shifts.length,
      filledShifts,
      missingAssignments,
      employeesMissingConstraints: missingConstraintUsers.length,
    },
    readiness: {
      canGenerate,
      hasMissingConstraints,
      hasNoEmployees,
      hasNoShifts,
      warnings,
    },
    auditLogs,
  };
}
