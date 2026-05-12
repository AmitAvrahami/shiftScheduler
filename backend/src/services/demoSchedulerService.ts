import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { calculateShiftStatus } from './solverMapper';
import { toDateKey } from '../utils/weekUtils';

export interface DemoSchedulerResult {
  status: 'OPTIMAL';
  assignmentCount: number;
  warnings: string[];
  violations: never[];
  solveTimeMs: number;
}

type AssignmentDoc = {
  shiftId: string;
  userId: string;
  scheduleId: string;
  assignedBy: 'algorithm';
  status: 'pending';
};

export async function runDemoScheduler(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string
): Promise<DemoSchedulerResult> {
  const startedAt = Date.now();

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
  const [shiftDefinitions, managerAssignments] = await Promise.all([
    ShiftDefinition.find({ _id: { $in: definitionIds } }).lean(),
    Assignment.find({ scheduleId, assignedBy: 'manager' }).lean(),
  ]);

  const definitionOrder = new Map(
    shiftDefinitions.map((definition) => [definition._id.toString(), definition.orderNumber])
  );
  const sortedShifts = [...shifts].sort((a, b) => {
    const dateCompare = a.date.getTime() - b.date.getTime();
    if (dateCompare !== 0) return dateCompare;
    return (
      (definitionOrder.get(a.definitionId.toString()) ?? Number.MAX_SAFE_INTEGER) -
      (definitionOrder.get(b.definitionId.toString()) ?? Number.MAX_SAFE_INTEGER)
    );
  });
  const sortedWorkers = [...workers].sort((a, b) =>
    a._id.toString().localeCompare(b._id.toString())
  );

  const shiftById = new Map(shifts.map((shift) => [shift._id.toString(), shift]));
  const assignedByDate = new Map<string, Set<string>>();
  const shiftCountByWorker = new Map(sortedWorkers.map((worker) => [worker._id.toString(), 0]));
  const managerCountByShift = new Map<string, number>();

  for (const assignment of managerAssignments) {
    const workerId = assignment.userId.toString();
    const shiftId = assignment.shiftId.toString();
    const shift = shiftById.get(shiftId);
    if (!shift) continue;

    const dateKey = toDateKey(shift.date);
    const workersForDate = assignedByDate.get(dateKey) ?? new Set<string>();
    workersForDate.add(workerId);
    assignedByDate.set(dateKey, workersForDate);

    shiftCountByWorker.set(workerId, (shiftCountByWorker.get(workerId) ?? 0) + 1);
    managerCountByShift.set(shiftId, (managerCountByShift.get(shiftId) ?? 0) + 1);
  }

  await Assignment.deleteMany({ scheduleId, assignedBy: 'algorithm' });

  const assignmentDocs: AssignmentDoc[] = [];
  const algorithmCountByShift = new Map<string, number>();
  const demoRequiredCountByShift = new Map<string, number>();
  const warnings: string[] = [];

  for (const shift of sortedShifts) {
    const shiftId = shift._id.toString();
    const dateKey = toDateKey(shift.date);
    const workersForDate = assignedByDate.get(dateKey) ?? new Set<string>();
    assignedByDate.set(dateKey, workersForDate);

    const managerAssignedCount = managerCountByShift.get(shiftId) ?? 0;
    const availableWorkerCount = Math.max(0, sortedWorkers.length - workersForDate.size);
    const demoRequiredCount = Math.min(
      shift.requiredCount,
      managerAssignedCount + availableWorkerCount
    );
    demoRequiredCountByShift.set(shiftId, demoRequiredCount);

    if (demoRequiredCount < shift.requiredCount) {
      warnings.push(
        `shift ${shiftId}: reduced required from ${shift.requiredCount} to ${demoRequiredCount} due to limited worker pool`
      );
    }

    const algorithmNeeded = Math.max(0, demoRequiredCount - managerAssignedCount);
    const candidates = sortedWorkers
      .filter((worker) => !workersForDate.has(worker._id.toString()))
      .sort((a, b) => {
        const aId = a._id.toString();
        const bId = b._id.toString();
        const countCompare =
          (shiftCountByWorker.get(aId) ?? 0) - (shiftCountByWorker.get(bId) ?? 0);
        return countCompare !== 0 ? countCompare : aId.localeCompare(bId);
      });

    for (const worker of candidates.slice(0, algorithmNeeded)) {
      const workerId = worker._id.toString();
      assignmentDocs.push({
        shiftId,
        userId: workerId,
        scheduleId: scheduleId.toString(),
        assignedBy: 'algorithm',
        status: 'pending',
      });
      workersForDate.add(workerId);
      shiftCountByWorker.set(workerId, (shiftCountByWorker.get(workerId) ?? 0) + 1);
      algorithmCountByShift.set(shiftId, (algorithmCountByShift.get(shiftId) ?? 0) + 1);
    }
  }

  if (assignmentDocs.length > 0) {
    await Assignment.insertMany(assignmentDocs);
  }

  const bulkOps = sortedShifts.map((shift) => {
    const shiftId = shift._id.toString();
    const assignedCount =
      (managerCountByShift.get(shiftId) ?? 0) + (algorithmCountByShift.get(shiftId) ?? 0);

    return {
      updateOne: {
        filter: { _id: shift._id },
        update: {
          $set: {
            status: calculateShiftStatus(demoRequiredCountByShift.get(shiftId) ?? 0, assignedCount),
          },
        },
      },
    };
  });
  if (bulkOps.length > 0) {
    await Shift.bulkWrite(bulkOps);
  }

  const solveTimeMs = Date.now() - startedAt;
  await AuditLog.create({
    performedBy: actorId,
    action: 'schedule_generated',
    refModel: 'WeeklySchedule',
    refId: scheduleId,
    after: {
      weekId,
      mode: 'demo',
      solverStatus: 'OPTIMAL',
      assignmentCount: assignmentDocs.length,
      solveTimeMs,
      warnings,
      violations: [],
    },
    ip,
  });

  return {
    status: 'OPTIMAL',
    assignmentCount: assignmentDocs.length,
    warnings,
    violations: [],
    solveTimeMs,
  };
}
