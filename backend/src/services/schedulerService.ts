import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Constraint from '../models/Constraint';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { callSolver, SolveStatus, SolverViolation, SolverWarning } from './solverClient';
import { toSolveRequest, toAssignmentDocs, calculateShiftStatus } from './solverMapper';

export interface SchedulerResult {
  status: SolveStatus;
  assignmentCount: number;
  warnings: SolverWarning[];
  violations: SolverViolation[];
  solveTimeMs: number;
}

export async function runScheduler(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string
): Promise<SchedulerResult> {
  // Phase 1: load data — schedule first (gate), then remaining reads in parallel
  const schedule = await WeeklySchedule.findOne({ weekId }).lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);
  if (schedule.status !== 'draft') {
    throw new AppError('Only draft schedules can be auto-generated', 422);
  }

  const scheduleId = schedule._id as mongoose.Types.ObjectId;

  const [shifts, workers] = await Promise.all([
    Shift.find({ scheduleId }).lean(),
    User.find({ isActive: true, role: { $in: ['employee', 'manager'] } }).lean(),
  ]);

  if (shifts.length === 0) throw new AppError('No shifts found for this schedule', 422);
  if (workers.length === 0) throw new AppError('No active workers found', 422);

  const definitionIds = [...new Set(shifts.map((s) => s.definitionId.toString()))];
  const userIds = workers.map((u) => u._id);

  const [shiftDefinitions, constraints] = await Promise.all([
    ShiftDefinition.find({ _id: { $in: definitionIds }, isActive: true }).lean(),
    Constraint.find({ weekId, userId: { $in: userIds } }).lean(),
  ]);

  // Phase 2: map MongoDB documents to solver wire format
  const solveRequest = toSolveRequest({ schedule, workers, shifts, shiftDefinitions, constraints });

  // Phase 3: call Python solver (errors propagate as AppError instances)
  const result = await callSolver(solveRequest);

  if (result.status === 'INFEASIBLE') {
    throw new AppError(
      'Solver could not find a feasible schedule — too many constraints are blocking coverage',
      422
    );
  }

  // Phase 4: write — only reached on OPTIMAL, FEASIBLE, or RELAXED

  // 4a: remove stale algorithm-generated assignments (idempotent re-run)
  await Assignment.deleteMany({ scheduleId, assignedBy: 'algorithm' });

  // 4b: insert new assignments
  const assignmentDocs = toAssignmentDocs(result, scheduleId.toString());
  if (assignmentDocs.length > 0) {
    await Assignment.insertMany(assignmentDocs);
  }

  // 4c: update shift statuses
  const countByShift = result.assignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.shift_id] = (acc[a.shift_id] ?? 0) + 1;
    return acc;
  }, {});

  const bulkOps = shifts.map((shift) => ({
    updateOne: {
      filter: { _id: shift._id },
      update: {
        $set: {
          status: calculateShiftStatus(shift.requiredCount, countByShift[shift._id.toString()] ?? 0),
        },
      },
    },
  }));
  if (bulkOps.length > 0) {
    await Shift.bulkWrite(bulkOps);
  }

  // 4d: audit log
  await AuditLog.create({
    performedBy: actorId,
    action: 'schedule_generated',
    refModel: 'WeeklySchedule',
    refId: scheduleId,
    after: {
      weekId,
      solverStatus: result.status,
      assignmentCount: assignmentDocs.length,
      solveTimeMs: result.solve_time_ms,
      warnings: result.warnings,
      violations: result.violations,
    },
    ip,
  });

  return {
    status: result.status,
    assignmentCount: assignmentDocs.length,
    warnings: result.warnings,
    violations: result.violations,
    solveTimeMs: result.solve_time_ms,
  };
}
