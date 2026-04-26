import { IUser } from '../models/User';
import { IShift } from '../models/Shift';
import { IShiftDefinition } from '../models/ShiftDefinition';
import { IConstraint } from '../models/Constraint';
import { IWeeklySchedule } from '../models/WeeklySchedule';
import {
  SolveRequest,
  SolveResult,
  SolverWorker,
} from './solverClient';
import { toDateKey } from '../utils/weekUtils';

export interface SchedulerInput {
  schedule: IWeeklySchedule;
  workers: IUser[];
  shifts: IShift[];
  shiftDefinitions: IShiftDefinition[];
  constraints: IConstraint[];
}

export function toSolveRequest(input: SchedulerInput): SolveRequest {
  const { schedule, workers, shifts, shiftDefinitions, constraints } = input;

  const constraintByUser = new Map(
    constraints.map((c) => [c.userId.toString(), c])
  );

  const solverWorkers: SolverWorker[] = workers.map((user) => {
    const constraint = constraintByUser.get(user._id.toString());
    return {
      id: user._id.toString(),
      role: user.role as 'employee' | 'manager',
      is_fixed_morning: user.isFixedMorningEmployee,
      availability: constraint
        ? constraint.entries.map((entry) => ({
            date: toDateKey(entry.date),
            definition_id: entry.definitionId.toString(),
            can_work: entry.canWork,
          }))
        : [],
    };
  });

  return {
    schedule_id: schedule._id.toString(),
    week_id: schedule.weekId,
    workers: solverWorkers,
    shift_definitions: shiftDefinitions.map((def) => ({
      id: def._id.toString(),
      name: def.name,
      start_time: def.startTime,
      end_time: def.endTime,
      duration_minutes: def.durationMinutes,
      crosses_midnight: def.crossesMidnight,
    })),
    shifts: shifts.map((shift) => ({
      id: shift._id.toString(),
      date: toDateKey(shift.date),
      definition_id: shift.definitionId.toString(),
      required_count: shift.requiredCount,
    })),
  };
}

export function toAssignmentDocs(
  result: SolveResult,
  scheduleId: string
): Array<{
  shiftId: string;
  userId: string;
  scheduleId: string;
  assignedBy: 'algorithm';
  status: 'pending';
}> {
  return result.assignments.map((a) => ({
    shiftId: a.shift_id,
    userId: a.worker_id,
    scheduleId,
    assignedBy: 'algorithm',
    status: 'pending',
  }));
}

export function calculateShiftStatus(
  required: number,
  assigned: number
): 'filled' | 'partial' | 'empty' {
  if (assigned === 0) return 'empty';
  if (assigned >= required) return 'filled';
  return 'partial';
}
