import type { AdminDashboardDTO, WeekWorkflowState } from '../types';

export interface ScheduleStats {
  total: number;
  filled: number;
  partial: number;
  empty: number;
  scheduleStatus: WeekWorkflowState | null;
}

export function getScheduleStats(dashboard: AdminDashboardDTO): ScheduleStats {
  const assignmentsByShiftId = new Map<string, number>();
  dashboard.assignments.forEach((assignment) => {
    assignmentsByShiftId.set(
      assignment.shiftId,
      (assignmentsByShiftId.get(assignment.shiftId) ?? 0) + 1
    );
  });

  let partial = 0;
  let empty = 0;

  dashboard.shifts.forEach((shift) => {
    const assignedCount = assignmentsByShiftId.get(shift.id) ?? 0;
    if (assignedCount === 0) {
      empty += 1;
    } else if (assignedCount < Math.max(0, shift.requiredEmployees)) {
      partial += 1;
    }
  });

  return {
    total: dashboard.kpis.totalShifts,
    filled: dashboard.kpis.filledShifts,
    partial,
    empty,
    scheduleStatus: dashboard.scheduleStatus,
  };
}
