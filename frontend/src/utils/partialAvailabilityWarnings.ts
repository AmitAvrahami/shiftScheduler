/**
 * Shared utility for detecting partial availability publish warnings.
 *
 * DESIGN PATTERN JUSTIFICATION:
 * We use the Strategy Pattern here for availability classification.
 * The classification logic is encapsulated in `classifyPartial` (the strategy),
 * which is selected at runtime based on overlap calculations. This keeps the
 * scheduling and dashboard presentation layers decoupled from constraint rules.
 */

import type { Constraint } from '../types/constraint';
import type {
  AdminDashboardAssignment,
  AdminDashboardShift,
  AdminDashboardEmployee,
} from '../pages/admin/types';
import type { ShiftDefinition } from '../types/constraint';
import { classifyPartial, overlapWithShift } from './availabilityPreview';
import { normalizeConstraintDate } from './weekUtils';

export interface PublishWarning {
  employeeId: string;
  employeeName: string;
  day: string; // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  overlapMinutes: number;
  explanation: string;
}

/**
 * Detects publish warnings for assigned shifts with partial availability classified as 'partial_warning'.
 *
 * ```mermaid
 * graph TD
 *     A[Start: List of Assignments] --> B[Loop each Assignment]
 *     B --> C{Employee & Shift & Def exist?}
 *     C -->|No| B
 *     C -->|Yes| D[Find Employee Constraints]
 *     D --> E{Match Date & definitionId?}
 *     E -->|No| B
 *     E -->|Yes| F{AvailabilityType == 'partial'?}
 *     F -->|No| B
 *     F -->|Yes| G[Classify Partial Availability]
 *     G --> H{Classification == 'partial_warning'?}
 *     H -->|No| B
 *     H -->|Yes| I[Calculate Overlap Minutes]
 *     I --> J[Generate Hebrew Warning]
 *     J --> K[Add to Warnings List]
 *     K --> B
 *     B --> L[End: Return Warnings List]
 * ```
 *
 * @param assignments - Current schedule assignments
 * @param shifts - Current schedule shifts
 * @param constraints - All employee constraints submitted for the week
 * @param employees - All active employees in the system
 * @param shiftDefinitions - All shift definitions in the system
 * @returns An array of typed publish warnings for 'partial_warning' cases
 *
 * @example
 * const warnings = detectPublishWarnings(assignments, shifts, constraints, employees, shiftDefinitions);
 */
export function detectPublishWarnings(
  assignments: AdminDashboardAssignment[],
  shifts: AdminDashboardShift[],
  constraints: Constraint[],
  employees: AdminDashboardEmployee[],
  shiftDefinitions: ShiftDefinition[]
): PublishWarning[] {
  const warnings: PublishWarning[] = [];

  const employeesMap = new Map(employees.map((e) => [e.id, e]));
  const shiftsMap = new Map(shifts.map((s) => [s.id, s]));
  const defsMap = new Map(shiftDefinitions.map((d) => [d._id, d]));

  const getEmployeeId = (c: Constraint): string => {
    if (typeof c.userId === 'string') return c.userId;
    return c.userId?._id ?? '';
  };

  const constraintsByEmployee = new Map<string, Constraint>();
  for (const c of constraints) {
    if (c && c.userId) {
      constraintsByEmployee.set(getEmployeeId(c), c);
    }
  }

  for (const assignment of assignments) {
    const shift = shiftsMap.get(assignment.shiftId);
    if (!shift) continue;

    const employee = employeesMap.get(assignment.employeeId);
    if (!employee) continue;

    const def = defsMap.get(shift.definitionId);
    if (!def) continue;

    const constraint = constraintsByEmployee.get(employee.id);
    if (!constraint) continue;

    const targetDate = normalizeConstraintDate(shift.day);
    const entry = constraint.entries.find(
      (e) =>
        normalizeConstraintDate(e.date) === targetDate &&
        String(e.definitionId) === String(shift.definitionId)
    );

    if (entry && entry.availabilityType === 'partial' && entry.startTime && entry.endTime) {
      const classification = classifyPartial(entry.startTime, entry.endTime, def);

      if (classification === 'partial_warning') {
        const overlap = overlapWithShift(entry.startTime, entry.endTime, def);
        const dayLabel = translateDayOfWeek(targetDate);

        const explanation = `לעובד/ת ${employee.name} יש זמינות חלקית (${entry.startTime}–${entry.endTime}) ביום ${dayLabel} במשמרת ${def.name}. חפיפה של ${overlap} דקות.`;

        warnings.push({
          employeeId: employee.id,
          employeeName: employee.name,
          day: targetDate,
          shiftId: shift.id,
          shiftName: def.name,
          startTime: entry.startTime,
          endTime: entry.endTime,
          overlapMinutes: overlap,
          explanation,
        });
      }
    }
  }

  return warnings;
}

function translateDayOfWeek(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return days[date.getDay()];
  } catch {
    return dateStr;
  }
}
