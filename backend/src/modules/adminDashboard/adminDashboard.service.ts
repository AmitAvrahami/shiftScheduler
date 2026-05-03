import WeeklySchedule from '../../models/WeeklySchedule';
import User from '../../models/User';
import Shift from '../../models/Shift';
import Assignment from '../../models/Assignment';
import Constraint from '../../models/Constraint';
import ShiftDefinition from '../../models/ShiftDefinition';
import AuditLog from '../../models/AuditLog';
import { getWeekDates } from '../../utils/weekUtils';
import type {
  AdminDashboardRaw,
  RawScheduleDoc,
  RawUserDoc,
  RawShiftDoc,
  RawShiftDefDoc,
  RawAssignmentDoc,
  RawConstraintDoc,
  RawAuditLogDoc,
} from './adminDashboard.dto';

export async function fetchDashboardData(weekId: string): Promise<AdminDashboardRaw> {
  // ── Derive week date range for audit log scoping ──────────────────────────
  // getWeekDates returns 7 local-midnight Dates: [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  const weekDates = getWeekDates(weekId);
  const weekStart = weekDates[0];
  const weekEnd = new Date(weekDates[6].getTime() + 24 * 60 * 60 * 1000); // end of Saturday

  // ── Batch 1: queries with no inter-dependencies ───────────────────────────
  const [schedule, employees, constraintDocs, shiftDefinitions, auditLogs] =
    await Promise.all([
      WeeklySchedule.findOne({ weekId })
        .lean<RawScheduleDoc>(),

      User.find({ isActive: true })
        .select('-password')
        .lean<RawUserDoc[]>(),

      Constraint.find({ weekId })
        .select('userId')
        .lean<RawConstraintDoc[]>(),

      ShiftDefinition.find({ isActive: true })
        .select('name startTime')
        .lean<RawShiftDefDoc[]>(),

      // Audit logs scoped to the week's date range — no global fallback.
      // Future weeks naturally return [] (no logs yet).
      AuditLog.find({ createdAt: { $gte: weekStart, $lt: weekEnd } })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean<RawAuditLogDoc[]>(),
    ]);

  // ── Batch 2: queries that depend on schedule._id ──────────────────────────
  const scheduleId = schedule?._id ?? null;

  const [shifts, assignments] = scheduleId
    ? await Promise.all([
        Shift.find({ scheduleId })
          .select('definitionId date startTime requiredCount status scheduleId')
          .lean<RawShiftDoc[]>(),
        Assignment.find({ scheduleId })
          .select('shiftId userId scheduleId')
          .lean<RawAssignmentDoc[]>(),
      ])
    : [[] as RawShiftDoc[], [] as RawAssignmentDoc[]];

  const constraintUserIds = constraintDocs.map((c) => String(c.userId));

  return {
    weekId,
    schedule: schedule ?? null,
    employees: employees ?? [],
    shiftDefinitions: shiftDefinitions ?? [],
    shifts,
    assignments,
    constraintUserIds,
    auditLogs: auditLogs ?? [],
  };
}
