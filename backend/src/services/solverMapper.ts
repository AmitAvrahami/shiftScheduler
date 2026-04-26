import mongoose from 'mongoose';
import {
  SolveRequest,
  SolveResult,
  SolverWorker,
} from './solverClient';
import { toDateKey } from '../utils/weekUtils';

// Lean-compatible plain-object shapes — only the fields the mapper actually reads.
// Using these instead of Document-extending model interfaces avoids the Lean vs Document
// type mismatch when callers pass .lean() results.

export interface LeanSchedule {
  _id: mongoose.Types.ObjectId;
  weekId: string;
}

export interface LeanUser {
  _id: mongoose.Types.ObjectId;
  role: 'employee' | 'manager' | 'admin';
  isFixedMorningEmployee: boolean;
}

export interface LeanConstraintEntry {
  date: Date;
  definitionId: mongoose.Types.ObjectId;
  canWork: boolean;
}

export interface LeanConstraint {
  userId: mongoose.Types.ObjectId;
  entries: LeanConstraintEntry[];
}

export interface LeanShiftDefinition {
  _id: mongoose.Types.ObjectId;
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  crossesMidnight: boolean;
}

export interface LeanShift {
  _id: mongoose.Types.ObjectId;
  date: Date;
  definitionId: mongoose.Types.ObjectId;
  requiredCount: number;
}

export interface SchedulerInput {
  schedule: LeanSchedule;
  workers: LeanUser[];
  shifts: LeanShift[];
  shiftDefinitions: LeanShiftDefinition[];
  constraints: LeanConstraint[];
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
      role: user.role === 'admin' ? 'manager' : user.role,
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
