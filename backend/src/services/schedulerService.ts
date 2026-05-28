import mongoose from 'mongoose';
import WeeklySchedule, { GenerationScore } from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Constraint from '../models/Constraint';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { SolveRequest, SolveStatus, SolverViolation, SolverWarning } from './solverClient';
import { toSolveRequest, toAssignmentDocs, calculateShiftStatus } from './solverMapper';
import { getSolver } from './solver/SolverFactory';
import { compileConstraints } from './compiler/compileConstraints';
import type { Constraint as DomainConstraint } from '../types/constraint';
import { logger } from '../utils/logger';

export interface SchedulerResult {
  status: SolveStatus;
  assignmentCount: number;
  warnings: SolverWarning[];
  violations: SolverViolation[];
  generationScore: GenerationScore;
  solveTimeMs: number;
}

export interface RunSchedulerOptions {
  domainConstraints?: DomainConstraint[];
}

export async function runScheduler(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string,
  options: RunSchedulerOptions = {}
): Promise<SchedulerResult> {
  // Phase 1: load data — schedule first (gate), then remaining reads in parallel
  const schedule = await WeeklySchedule.findOne({ weekId }).lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);
  if (schedule.status !== 'generating') {
    throw new AppError('Only generating-state schedules can be auto-generated', 422);
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

  // Phase 2a: compile constraints via the Node-side compiler. PR #3 sends
  // the generic DTO on the wire alongside the legacy availability fields;
  // Python consumes forbidden assignments additively during migration.
  const compiled = compileConstraints({
    weekId: schedule.weekId,
    workers,
    shifts,
    shiftDefinitions,
    constraints,
    domainConstraints: options.domainConstraints,
  });

  logger.info('compileConstraints produced generic payload', {
    weekId: schedule.weekId,
    forbiddenAssignments: compiled.generic.forbidden_assignments.length,
    penalties: compiled.generic.penalties.length,
  });

  // Phase 2b: map MongoDB documents to solver wire format and append the
  // generic payload. Legacy availability remains present for compatibility.
  const baseRequest = toSolveRequest(
    { schedule, workers, shifts, shiftDefinitions, constraints },
    compiled.availabilityByWorker
  );
  const solveRequest: SolveRequest = {
    ...baseRequest,
    forbidden_assignments: compiled.generic.forbidden_assignments,
    penalties: compiled.generic.penalties,
    relaxation_weights: compiled.generic.relaxation_weights,
  };

  // Phase 3: call solver through factory (errors propagate as AppError instances)
  const result = await getSolver().solve(solveRequest);

  if (result.status === 'INFEASIBLE') {
    throw new AppError(
      'Solver could not find a feasible schedule — too many constraints are blocking coverage',
      422
    );
  }

  // Phase 4: write — only reached on OPTIMAL, FEASIBLE, or RELAXED

  // 4a: regeneration starts from a clean schedule, clearing all prior
  // assignments including manual edits before writing solver output.
  await Assignment.deleteMany({ scheduleId });

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
          status: calculateShiftStatus(
            shift.requiredCount,
            countByShift[shift._id.toString()] ?? 0
          ),
        },
      },
    },
  }));
  if (bulkOps.length > 0) {
    await Shift.bulkWrite(bulkOps);
  }

  // 4d: build the quality score (PR10). qualityScore is intentionally omitted
  // until a normalized formula is defined; totalPenalty is the v1 metric and
  // counts soft-constraint penalties only (relaxation penalties are excluded by
  // the solver). Shares its timestamp with lastGeneratedAt below.
  const generatedAt = new Date();
  const generationScore: GenerationScore = {
    totalPenalty: result.total_penalty ?? 0,
    breakdown: result.penalty_breakdown ?? {},
    generatedAt,
  };

  // 4e: audit log
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
      score: {
        totalPenalty: generationScore.totalPenalty,
        breakdown: generationScore.breakdown,
      },
    },
    ip,
  });

  // 4f: persist latest solver warnings/violations and quality score on the
  // schedule so they survive reloads and stay visible (non-blocking, display-only)
  await WeeklySchedule.updateOne(
    { _id: scheduleId },
    {
      $set: {
        generationWarnings: result.warnings,
        generationViolations: result.violations,
        generationScore,
        lastGeneratedAt: generatedAt,
      },
    }
  );

  return {
    status: result.status,
    assignmentCount: assignmentDocs.length,
    warnings: result.warnings,
    violations: result.violations,
    generationScore,
    solveTimeMs: result.solve_time_ms,
  };
}
