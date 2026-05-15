import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Assignment from '../models/Assignment';
import { runScheduler } from '../services/schedulerService';
import type { SolveRequest, SolveResult, SolverAssignment } from '../services/solverClient';
import {
  type CalendarDateString,
  constraintId,
  type Constraint,
  DEFAULT_SOFT_WEIGHTS,
  type SoftConstraint,
  workerId,
} from '../types/constraint';
import { startSolverStub, type SolverStubHandle } from './helpers/solverStubServer';

/**
 * Proves the assignment_preference soft constraint path works end-to-end:
 *
 *   domain Constraint
 *     → runScheduler(weekId, actorId, ip, { domainConstraints })
 *     → compileConstraints
 *     → PenaltyTermDTO in SolveRequest.penalties
 *     → solver response
 *     → Assignment persistence
 *
 * The solver itself is replaced by a programmable in-process HTTP stub. The
 * stub callback inspects `req.penalties` and `req.forbidden_assignments` and
 * picks a feasible, unpenalized worker — mimicking the objective behaviour
 * we expect from the real Python solver without depending on it.
 */

const WEEK_ID = '2026-W20';
const ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');
const SUNDAY_LOCAL = new Date(2026, 4, 10, 0, 0, 0, 0);
const SUNDAY_DATE_KEY = '2026-05-10' as CalendarDateString;

let mongoServer: MongoMemoryServer;
let solverStub: SolverStubHandle;
let prevSolverUrl: string | undefined;
let prevSchedulerEngine: string | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
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

// ---- Seed helpers (mirrors schedulerService.test.ts:40-91) ----

async function seedSchedule() {
  return WeeklySchedule.create({
    weekId: WEEK_ID,
    startDate: new Date(2026, 4, 10),
    endDate: new Date(2026, 4, 16),
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

// ---- Domain constraint builder ----

function assignmentPreferenceFor(
  workerIdStr: string,
  definitionIdStr: string,
  date: CalendarDateString = SUNDAY_DATE_KEY
): SoftConstraint {
  return {
    id: constraintId(`pref:${workerIdStr}:${date}:${definitionIdStr}`),
    kind: 'soft',
    category: 'assignment_preference',
    weight: DEFAULT_SOFT_WEIGHTS.assignment_preference,
    targets: {
      scope: 'all',
      targets: [
        { kind: 'employee', employeeId: workerId(workerIdStr) },
        { kind: 'slot', date, definitionId: definitionIdStr },
      ],
    },
    source: { type: 'manager_override' },
  };
}

// ---- Stub callback: simulates a real solver's objective behaviour ----
//
// For every shift, pick the first worker that is:
//   1. not in `forbidden_assignments` for that shift, and
//   2. not the target of any `assignment_preference` penalty for that shift.
// If every feasible worker is penalized, fall back to the first feasible one
// (proves the penalty is soft, not hard).

function pickFeasibleAssignments(req: SolveRequest): SolverAssignment[] {
  const forbidden = new Set(
    (req.forbidden_assignments ?? []).map((f) => `${f.worker_id}|${f.shift_id}`)
  );
  const penalized = new Set(
    (req.penalties ?? [])
      .filter((p) => p.category === 'assignment_preference')
      .map((p) => `${p.worker_id}|${p.shift_id}`)
  );

  return req.shifts.flatMap((shift) => {
    const feasible = req.workers.filter((w) => !forbidden.has(`${w.id}|${shift.id}`));
    if (feasible.length === 0) return [];

    const unpenalized = feasible.filter((w) => !penalized.has(`${w.id}|${shift.id}`));
    const chosen = unpenalized[0] ?? feasible[0];

    return [
      {
        shift_id: shift.id,
        worker_id: chosen.id,
        assigned_by: 'algorithm' as const,
      },
    ];
  });
}

function programSolverWithPreferenceLogic(): void {
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

describe('runScheduler — assignment_preference soft constraint (end-to-end)', () => {
  it('baseline: with no domainConstraints, the no-preference flow still produces an assignment', async () => {
    const { schedule, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithPreferenceLogic();

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    // Solver received no assignment_preference penalties.
    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.penalties ?? []).toEqual([]);
    expect(sent!.forbidden_assignments ?? []).toEqual([]);

    const assignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(assignment).not.toBeNull();
    const validWorkerIds = [workerA._id.toString(), workerB._id.toString()];
    expect(validWorkerIds).toContain(assignment!.userId.toString());
    expect(assignment!.shiftId.toString()).toBe(shift._id.toString());
  });

  it('flips the choice when a preference penalizes the otherwise-picked worker', async () => {
    const { schedule, def, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithPreferenceLogic();

    // Baseline run picks one of the two; capture it so we can prove the
    // preference flipped the choice on the second run.
    const baseline = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');
    expect(baseline.status).toBe('OPTIMAL');
    const baselineAssignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(baselineAssignment).not.toBeNull();
    const baselineWorkerId = baselineAssignment!.userId.toString();
    expect([workerA._id.toString(), workerB._id.toString()]).toContain(baselineWorkerId);

    // Now penalize whichever worker the baseline picked.
    const penalizedWorkerId = baselineWorkerId;
    const otherWorkerId =
      penalizedWorkerId === workerA._id.toString()
        ? workerB._id.toString()
        : workerA._id.toString();
    const preference: Constraint = assignmentPreferenceFor(penalizedWorkerId, def._id.toString());

    // Re-run requires the schedule back in 'generating'; runScheduler does
    // not transition status on success, but verify and reset to be safe.
    await WeeklySchedule.updateOne({ weekId: WEEK_ID }, { status: 'generating' });
    solverStub.reset();
    programSolverWithPreferenceLogic();

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1', {
      domainConstraints: [preference],
    });

    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    // The penalty actually reached the solver in the expected DTO shape.
    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.penalties).toEqual([
      {
        worker_id: penalizedWorkerId,
        shift_id: shift._id.toString(),
        category: 'assignment_preference',
        weight: 100,
      },
    ]);
    expect(sent!.forbidden_assignments ?? []).toEqual([]);

    // And the persisted assignment now names the unpenalized worker.
    const assignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(assignment).not.toBeNull();
    expect(assignment!.userId.toString()).toBe(otherWorkerId);
  });

  it('stays soft when the penalized worker is the only feasible option', async () => {
    const { schedule, def, shift, workerA, workerB } = await seedTwoEmployeeScenario();
    programSolverWithPreferenceLogic();

    // Penalize workerA AND make workerB infeasible via a hard forbidden
    // assignment. The solver should still assign workerA (proves softness).
    const preference = assignmentPreferenceFor(workerA._id.toString(), def._id.toString());
    const forbidWorkerB: Constraint = {
      id: constraintId(`forbid:${workerB._id.toString()}:${shift._id.toString()}`),
      kind: 'hard',
      category: 'availability',
      targets: {
        scope: 'all',
        targets: [
          { kind: 'employee', employeeId: workerId(workerB._id.toString()) },
          {
            kind: 'slot',
            date: SUNDAY_DATE_KEY,
            definitionId: def._id.toString(),
          },
        ],
      },
      source: { type: 'manager_override' },
    };

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1', {
      domainConstraints: [preference, forbidWorkerB],
    });

    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);

    // Solver received both the penalty and the forbidden assignment.
    const sent = solverStub.getLastRequest();
    expect(sent).not.toBeNull();
    expect(sent!.penalties).toEqual([
      {
        worker_id: workerA._id.toString(),
        shift_id: shift._id.toString(),
        category: 'assignment_preference',
        weight: 100,
      },
    ]);
    expect(sent!.forbidden_assignments).toEqual([
      { worker_id: workerB._id.toString(), shift_id: shift._id.toString() },
    ]);

    // workerA was assigned despite the soft penalty — schedule still solves.
    const assignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(assignment).not.toBeNull();
    expect(assignment!.userId.toString()).toBe(workerA._id.toString());
  });
});
