import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import ShiftDefinition from '../models/ShiftDefinition';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import { startSolverStub, SolverStubHandle } from './helpers/solverStubServer';

/**
 * End-to-end integration coverage for automatic schedule generation.
 *
 * Unlike scheduleGenerate.test.ts / schedulerService.test.ts which mock
 * `callSolver`, this suite exercises the real chain:
 *   POST /api/v1/schedules/:weekId/generate
 *     → controller
 *     → runScheduler
 *     → SolverFactory.getSolver()
 *     → CurrentHttpSolver.solve()
 *     → callSolver() over real fetch
 *     → local HTTP stub (replaces FastAPI solver)
 *     → response parsing
 *     → assignment persistence
 *     → audit log write.
 */

const WEEK_ID = '2026-W30';

let mongoServer: MongoMemoryServer;
let solverStub: SolverStubHandle;
let prevSolverUrl: string | undefined;
let prevSchedulerEngine: string | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long';

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

function makeToken(user: { _id: unknown; email: string; role: string }): string {
  return jwt.sign(
    { _id: String(user._id), email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

describe('E2E: POST /api/v1/schedules/:weekId/generate against real solver HTTP transport', () => {
  it('runs the full chain — controller → SolverFactory → CurrentHttpSolver → HTTP → persistence → audit log', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'manager@e2e.test',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    const alice = await User.create({
      name: 'Alice',
      email: 'alice@e2e.test',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    await User.create({
      name: 'Bob',
      email: 'bob@e2e.test',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });

    // One active template — Sunday morning. The controller materializes Shift
    // slots from this template before invoking the solver.
    await ShiftDefinition.create({
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy: manager._id,
      requiredStaffCount: 1,
    });

    const res = await request(app)
      .post(`/api/v1/schedules/${WEEK_ID}/generate`)
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    // ---- HTTP response ----
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(['OPTIMAL', 'FEASIBLE', 'RELAXED']).toContain(res.body.status);
    expect(res.body.assignmentCount).toBeGreaterThan(0);
    expect(typeof res.body.solveTimeMs).toBe('number');
    expect(res.body.solveTimeMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(Array.isArray(res.body.violations)).toBe(true);

    // ---- Stub was hit through real fetch with snake_case wire payload ----
    expect(solverStub.getRequestCount()).toBe(1);
    const solveRequest = solverStub.getLastRequest();
    expect(solveRequest).not.toBeNull();
    expect(solveRequest!.week_id).toBe(WEEK_ID);
    expect(typeof solveRequest!.schedule_id).toBe('string');
    expect(Array.isArray(solveRequest!.workers)).toBe(true);
    expect(Array.isArray(solveRequest!.shift_definitions)).toBe(true);
    expect(Array.isArray(solveRequest!.shifts)).toBe(true);
    expect(solveRequest!.shifts.length).toBeGreaterThan(0);
    expect(solveRequest!.workers.length).toBeGreaterThan(0);
    // Snake-case contract drift guard: camelCase keys must not leak through.
    expect(solveRequest as unknown as Record<string, unknown>).not.toHaveProperty('scheduleId');
    expect(solveRequest as unknown as Record<string, unknown>).not.toHaveProperty('weekId');
    expect(solveRequest!.shifts[0]).toHaveProperty('definition_id');
    expect(solveRequest!.shifts[0]).toHaveProperty('required_count');
    expect(solveRequest!.shift_definitions[0]).toHaveProperty('start_time');
    expect(solveRequest!.shift_definitions[0]).toHaveProperty('end_time');

    // ---- Assignments persisted ----
    const schedule = await WeeklySchedule.findOne({ weekId: WEEK_ID }).lean();
    expect(schedule).not.toBeNull();
    expect(schedule!.status).toBe('draft');

    const assignments = await Assignment.find({ scheduleId: schedule!._id }).lean();
    expect(assignments).toHaveLength(res.body.assignmentCount);

    const validShiftIds = new Set(
      (await Shift.find({ scheduleId: schedule!._id }).lean()).map((s) => s._id.toString())
    );
    const validWorkerIds = new Set(
      [manager._id.toString(), alice._id.toString()].concat(
        (await User.find({ role: 'employee' }).lean()).map((u) => u._id.toString())
      )
    );
    for (const a of assignments) {
      expect(validShiftIds.has(a.shiftId.toString())).toBe(true);
      expect(validWorkerIds.has(a.userId.toString())).toBe(true);
      expect(a.assignedBy).toBe('algorithm');
      expect(a.status).toBe('pending');
    }

    // ---- Audit log ----
    const auditLog = await AuditLog.findOne({ action: 'schedule_generated' }).lean();
    expect(auditLog).not.toBeNull();
    expect(auditLog!.refModel).toBe('WeeklySchedule');
    expect(auditLog!.refId!.toString()).toBe(schedule!._id.toString());
    expect(auditLog!.performedBy.toString()).toBe(manager._id.toString());

    const after = auditLog!.after as Record<string, unknown>;
    expect(after.weekId).toBe(WEEK_ID);
    expect(after.solverStatus).toBe(res.body.status);
    expect(after.solveTimeMs).toBe(res.body.solveTimeMs);
    expect(after.assignmentCount).toBe(res.body.assignmentCount);
    expect(Array.isArray(after.warnings)).toBe(true);
    expect(Array.isArray(after.violations)).toBe(true);
  });
});
