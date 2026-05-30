import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Constraint from '../models/Constraint';
import Assignment from '../models/Assignment';
import { runScheduler } from '../services/schedulerService';
import type { SolveRequest, SolveResult, SolverAssignment } from '../services/solverClient';
import { startSolverStub, type SolverStubHandle } from './helpers/solverStubServer';

/**
 * Proves the canWork:false employee-availability flow works end-to-end with a
 * real Mongo `Constraint` document:
 *
 *   Constraint{canWork:false}
 *     → Constraint.find in runScheduler
 *     → compileConstraints → ForbiddenAssignmentDTO
 *     → SolveRequest.forbidden_assignments (+ legacy availability map)
 *     → solver result respects the forbidden pair
 *     → Assignment persistence excludes the forbidden (worker, shift) pair
 *
 * Uses the in-process HTTP solver stub so this exercises the real
 * CurrentHttpSolver + fetch path without needing the Python service.
 */

const WEEK_ID = '2026-W25';
const ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');
// Week 2026-W25 is Sun Jun 14 - Sat Jun 20, 2026 (IST Sun-Sat convention).
const SUNDAY_LOCAL = new Date(2026, 5, 14, 0, 0, 0, 0);
const SUNDAY_DATE_KEY = '2026-06-14';

let mongoServer: MongoMemoryReplSet;
let solverStub: SolverStubHandle;
let prevSolverUrl: string | undefined;
let prevSchedulerEngine: string | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  solverStub = await startSolverStub();
  prevSolverUrl = process.env.SOLVER_URL;
  prevSchedulerEngine = process.env.SCHEDULER_ENGINE;
  process.env.SOLVER_URL = solverStub.url;
  process.env.SCHEDULER_ENGINE = 'legacy';
});

afterAll(async () => {
  await solverStub.close();
  await mongoose.disconnect();
  await mongoServer.stop();

  if (prevSolverUrl === undefined) delete process.env.SOLVER_URL;
  else process.env.SOLVER_URL = prevSolverUrl;
  if (prevSchedulerEngine === undefined) delete process.env.SCHEDULER_ENGINE;
  else process.env.SCHEDULER_ENGINE = prevSchedulerEngine;
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
  solverStub.reset();
});

// ---- Seed helpers ----

async function seedSchedule() {
  return WeeklySchedule.create({
    weekId: WEEK_ID,
    startDate: SUNDAY_LOCAL,
    endDate: new Date(2026, 5, 20),
    status: 'generating',
    generatedBy: 'auto',
  });
}

async function seedDefinition() {
  return ShiftDefinition.create({
    name: 'Morning',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFD700',
    isActive: true,
    orderNumber: 1,
    createdBy: ACTOR_ID,
  });
}

async function seedEmployee(name: string) {
  return User.create({
    name,
    email: `${name.toLowerCase()}@test.com`,
    password: 'password123',
    role: 'employee',
    isActive: true,
    isFixedMorningEmployee: false,
  });
}

async function seedTwoEmployeeScenario() {
  const schedule = await seedSchedule();
  const def = await seedDefinition();
  const workerA = await seedEmployee('Alice');
  const workerB = await seedEmployee('Bob');

  const shift = await Shift.create({
    scheduleId: schedule._id,
    definitionId: def._id,
    date: SUNDAY_LOCAL,
    requiredCount: 1,
    status: 'empty',
  });

  return { schedule, def, workerA, workerB, shift };
}

// ---- Stub solver: respect `forbidden_assignments` as a hard constraint ----
//
// For every shift, pick the first worker that is NOT in `forbidden_assignments`
// for that shift. If no worker is feasible the shift is left unassigned.
// This mimics how the real Python solver treats availability — hard domain
// pruning — without depending on it.

function pickFeasibleAssignments(req: SolveRequest): SolverAssignment[] {
  const forbidden = new Set(
    (req.forbidden_assignments ?? []).map((f) => `${f.worker_id}|${f.shift_id}`)
  );

  return req.shifts.flatMap((shift) => {
    const feasible = req.workers.find((w) => !forbidden.has(`${w.id}|${shift.id}`));
    if (!feasible) return [];

    return [
      {
        shift_id: shift.id,
        worker_id: feasible.id,
        assigned_by: 'algorithm' as const,
      },
    ];
  });
}

function programSolverWithForbiddenLogic(): void {
  solverStub.programResponse(
    (req): SolveResult => ({
      status: 'OPTIMAL',
      assignments: pickFeasibleAssignments(req),
      violations: [],
      warnings: [],
      solve_time_ms: 3,
    })
  );
}

// ---- Tests ----

describe('runScheduler — canWork:false constraint (end-to-end)', () => {
  it('propagates a saved canWork:false to forbidden_assignments AND excludes the worker from the persisted Assignment', async () => {
    const { schedule, def, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithForbiddenLogic();

    // Worker B declares "cannot work" for the Sunday Morning shift.
    await Constraint.create({
      userId: workerB._id,
      weekId: WEEK_ID,
      entries: [{ date: SUNDAY_LOCAL, definitionId: def._id, canWork: false }],
      isLocked: true,
      submittedVia: 'self',
    });

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');
    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    // Both the new generic payload AND the legacy availability map carried
    // the constraint to the solver.
    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.forbidden_assignments).toEqual([
      { worker_id: workerB._id.toString(), shift_id: shift._id.toString() },
    ]);

    const workerBPayload = sent!.workers.find((w) => w.id === workerB._id.toString());
    expect(workerBPayload).toBeDefined();
    expect(workerBPayload!.availability).toEqual([
      {
        date: SUNDAY_DATE_KEY,
        definition_id: def._id.toString(),
        can_work: false,
      },
    ]);

    // The persisted Assignment names worker A and never worker B.
    const assignments = await Assignment.find({ scheduleId: schedule._id }).lean();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId.toString()).toBe(workerA._id.toString());
    expect(assignments[0].shiftId.toString()).toBe(shift._id.toString());

    const forbiddenAssignment = await Assignment.findOne({
      scheduleId: schedule._id,
      userId: workerB._id,
      shiftId: shift._id,
    });
    expect(forbiddenAssignment).toBeNull();
  });

  it('expands to all parallel shifts on the same date+definition and keeps the worker out of every one', async () => {
    const schedule = await seedSchedule();
    const def = await seedDefinition();
    const workerA = await seedEmployee('Alice');
    const workerB = await seedEmployee('Bob');

    // Two parallel Sunday-Morning slots (definitionId + date shared).
    const shift1 = await Shift.create({
      scheduleId: schedule._id,
      definitionId: def._id,
      date: SUNDAY_LOCAL,
      requiredCount: 1,
      status: 'empty',
    });
    const shift2 = await Shift.create({
      scheduleId: schedule._id,
      definitionId: def._id,
      date: SUNDAY_LOCAL,
      requiredCount: 1,
      status: 'empty',
    });

    programSolverWithForbiddenLogic();

    await Constraint.create({
      userId: workerB._id,
      weekId: WEEK_ID,
      entries: [{ date: SUNDAY_LOCAL, definitionId: def._id, canWork: false }],
      submittedVia: 'self',
    });

    await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();

    const forbiddenPairs = (sent!.forbidden_assignments ?? [])
      .map((f) => `${f.worker_id}|${f.shift_id}`)
      .sort();
    expect(forbiddenPairs).toEqual(
      [
        `${workerB._id.toString()}|${shift1._id.toString()}`,
        `${workerB._id.toString()}|${shift2._id.toString()}`,
      ].sort()
    );

    // Stub picks the first feasible worker for each shift — that has to be A
    // for both because B is forbidden on both. Since we have only two workers
    // and only one feasible per shift, both shifts get assigned to A.
    const assignments = await Assignment.find({ scheduleId: schedule._id }).lean();
    expect(assignments).toHaveLength(2);
    for (const a of assignments) {
      expect(a.userId.toString()).toBe(workerA._id.toString());
    }
  });

  it('baseline: with no Constraint document, generation still succeeds and sends no forbidden_assignments', async () => {
    const { schedule, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithForbiddenLogic();

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');
    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.forbidden_assignments ?? []).toEqual([]);

    // Either worker is acceptable when nobody is forbidden.
    const assignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(assignment).not.toBeNull();
    expect(assignment!.shiftId.toString()).toBe(shift._id.toString());
    expect([workerA._id.toString(), workerB._id.toString()]).toContain(
      assignment!.userId.toString()
    );
  });

  it('skips a canWork:false entry whose definitionId does not match any seeded shift (no spurious forbidden entry)', async () => {
    const { schedule, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithForbiddenLogic();

    // Constraint targets a different definitionId — no slot to match.
    const otherDefinitionId = new mongoose.Types.ObjectId();
    await Constraint.create({
      userId: workerB._id,
      weekId: WEEK_ID,
      entries: [{ date: SUNDAY_LOCAL, definitionId: otherDefinitionId, canWork: false }],
      submittedVia: 'self',
    });

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');
    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.forbidden_assignments ?? []).toEqual([]);

    // Either worker is still acceptable since the unmatched constraint was
    // silently dropped (definitionId doesn't resolve to a shift).
    const assignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(assignment).not.toBeNull();
    expect(assignment!.shiftId.toString()).toBe(shift._id.toString());
    expect([workerA._id.toString(), workerB._id.toString()]).toContain(
      assignment!.userId.toString()
    );
  });
});
