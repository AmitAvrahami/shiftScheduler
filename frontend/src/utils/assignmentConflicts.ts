import type {
  AdminDashboardAssignment,
  AdminDashboardEmployee,
  AdminDashboardShift,
} from '../pages/admin/types';
import type { Constraint, ShiftDefinition } from '../types/constraint';
import { classifyPartial, overlapWithShift } from './availabilityPreview';
import { normalizeConstraintDate } from './weekUtils';
import {
  getDayLabel,
  getShiftTypeLabel,
  normalizeShiftDay,
} from '../pages/admin/utils/scheduleBoardUtils';

export type AssignmentWarningKind =
  | 'already_assigned_same_day'
  | 'unavailable_constraint'
  | 'partial_availability';

export interface AssignmentWarning {
  kind: AssignmentWarningKind;
  title: string;
  explanation: string;
}

export interface DetectAssignmentConflictsArgs {
  targetShift: AdminDashboardShift;
  candidateEmployeeId: string;
  employees: AdminDashboardEmployee[];
  shifts: AdminDashboardShift[];
  assignments: AdminDashboardAssignment[];
  constraints: Constraint[];
  shiftDefinitions: ShiftDefinition[];
}

function getConstraintEmployeeId(c: Constraint): string {
  if (typeof c.userId === 'string') return c.userId;
  return c.userId?._id ?? '';
}

function shiftDisplayName(
  shift: AdminDashboardShift,
  defsById: Map<string, ShiftDefinition>
): string {
  const def = defsById.get(shift.definitionId);
  if (def?.name) return def.name;
  return getShiftTypeLabel(shift.type);
}

function dayLabelFor(shift: AdminDashboardShift): string {
  const dayKey = normalizeShiftDay(shift.day);
  return dayKey ? getDayLabel(dayKey) : normalizeConstraintDate(shift.day);
}

export function detectAssignmentConflicts(
  args: DetectAssignmentConflictsArgs
): AssignmentWarning[] {
  const {
    targetShift,
    candidateEmployeeId,
    employees,
    shifts,
    assignments,
    constraints,
    shiftDefinitions,
  } = args;

  const employee = employees.find((e) => e.id === candidateEmployeeId);
  if (!employee) return [];

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const defsById = new Map(shiftDefinitions.map((d) => [d._id, d]));
  const warnings: AssignmentWarning[] = [];

  const targetDate = normalizeConstraintDate(targetShift.day);

  // 1. Same-day check (advisory; only compares date, not time overlap).
  for (const assignment of assignments) {
    if (assignment.employeeId !== candidateEmployeeId) continue;
    if (assignment.shiftId === targetShift.id) continue;

    const otherShift = shiftsById.get(assignment.shiftId);
    if (!otherShift) continue;
    if (normalizeConstraintDate(otherShift.day) !== targetDate) continue;

    const otherName = shiftDisplayName(otherShift, defsById);
    warnings.push({
      kind: 'already_assigned_same_day',
      title: 'כבר משובץ באותו יום',
      explanation: `${employee.name} כבר משובץ למשמרת ${otherName} באותו יום (${dayLabelFor(targetShift)}).`,
    });
  }

  // 2. Constraint check (unavailable / partial availability).
  const constraint = constraints.find((c) => getConstraintEmployeeId(c) === candidateEmployeeId);
  if (constraint) {
    const entry = constraint.entries.find(
      (e) =>
        normalizeConstraintDate(e.date) === targetDate &&
        String(e.definitionId) === String(targetShift.definitionId)
    );

    if (entry) {
      const isUnavailable = entry.availabilityType === 'unavailable' || entry.canWork === false;

      if (isUnavailable) {
        warnings.push({
          kind: 'unavailable_constraint',
          title: 'אילוץ אי־זמינות',
          explanation: `${employee.name} הצהיר/ה שאינו/ה יכול/ה לעבוד במשמרת זו (${dayLabelFor(targetShift)} · ${shiftDisplayName(targetShift, defsById)}).`,
        });
      } else if (entry.availabilityType === 'partial' && entry.startTime && entry.endTime) {
        const def = defsById.get(targetShift.definitionId);
        if (def) {
          const classification = classifyPartial(entry.startTime, entry.endTime, def);
          if (classification === 'partial_warning') {
            const overlap = overlapWithShift(entry.startTime, entry.endTime, def);
            warnings.push({
              kind: 'partial_availability',
              title: 'זמינות חלקית',
              explanation: `${employee.name} זמין/ה רק בחלון ${entry.startTime}–${entry.endTime} במשמרת ${def.name} (חפיפה ${overlap} דקות).`,
            });
          }
        }
      }
    }
  }

  return warnings;
}
