import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { getWeekDates } from '../utils/weekUtils';

import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import ShiftDefinition from '../models/ShiftDefinition';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import Constraint from '../models/Constraint';
import type { SolveRequest, SolveResult, SolverAssignment } from '../services/solverClient';

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

  describe('E2E: Partial Availability and Unavailability Solver Integration', () => {
    let manager: InstanceType<typeof User>;
    let alice: InstanceType<typeof User>;
    let bob: InstanceType<typeof User>;
    let shiftDef: InstanceType<typeof ShiftDefinition>;
    let SUNDAY_LOCAL: Date;

    beforeEach(async () => {
      SUNDAY_LOCAL = getWeekDates(WEEK_ID)[0];

      manager = await User.create({
        name: 'Manager',
        email: 'manager@e2e.test',
        password: 'Password123!',
        role: 'manager',
        isActive: true,
      });

      alice = await User.create({
        name: 'Alice',
        email: 'alice@e2e.test',
        password: 'Password123!',
        role: 'employee',
        isActive: true,
        isFixedMorningEmployee: false,
      });

      bob = await User.create({
        name: 'Bob',
        email: 'bob@e2e.test',
        password: 'Password123!',
        role: 'employee',
        isActive: true,
        isFixedMorningEmployee: false,
      });

      // Seed Sunday morning shift template: 06:45 - 14:45
      shiftDef = await ShiftDefinition.create({
        name: 'בוקר',
        startTime: '06:45',
        endTime: '14:45',
        daysOfWeek: [0], // Sunday
        durationMinutes: 480,
        crossesMidnight: false,
        color: '#FFD700',
        isActive: true,
        orderNumber: 1,
        createdBy: manager._id,
        requiredStaffCount: 1,
      });
    });

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

    function pickFeasibleAssignments(req: SolveRequest): SolverAssignment[] {
      const forbidden = new Set(
        (req.forbidden_assignments ?? []).map((f) => `${f.worker_id}|${f.shift_id}`)
      );

      return req.shifts.flatMap((shift) => {
        // Find the first worker who has 'employee' role and is NOT forbidden for this shift
        const feasible = req.workers.find(
          (w) => w.role === 'employee' && !forbidden.has(`${w.id}|${shift.id}`)
        );
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

    it('Rule 1: Partial availability < 6h overlap compiles to forbidden and is not assigned by solver', async () => {
      programSolverWithForbiddenLogic();

      // Alice is partial: 10:00 - 14:00 (4h overlap with shift 06:45-14:45)
      // Since overlap < 6h, it compiles to forbidden.
      await Constraint.create({
        userId: alice._id,
        weekId: WEEK_ID,
        entries: [
          {
            date: SUNDAY_LOCAL,
            definitionId: shiftDef._id,
            canWork: true,
            availabilityType: 'partial',
            startTime: '10:00',
            endTime: '14:00',
          },
        ],
        isLocked: true,
        submittedVia: 'self',
      });

      const res = await request(app)
        .post(`/api/v1/schedules/${WEEK_ID}/generate`)
        .set('Authorization', `Bearer ${makeToken(manager)}`);

      expect(res.status).toBe(200);

      // Verify solver request inputs
      const sent = solverStub.getLastRequest();
      expect(sent).not.toBeNull();

      const shift = await Shift.findOne({ definitionId: shiftDef._id });
      expect(shift).not.toBeNull();

      // Alice should be in forbidden assignments
      const aliceForbidden = sent!.forbidden_assignments?.some(
        (f) => f.worker_id === alice._id.toString() && f.shift_id === shift!._id.toString()
      );
      expect(aliceForbidden).toBe(true);

      // Verify that Alice is NOT assigned (Bob is assigned instead)
      const assignments = await Assignment.find({ shiftId: shift!._id }).lean();
      expect(assignments).toHaveLength(1);
      expect(assignments[0].userId.toString()).toBe(bob._id.toString());
    });

    it('Rule 2: Partial availability >= 6h overlap compiles to penalty and remains assignable', async () => {
      programSolverWithForbiddenLogic();

      // Alice is partial: 07:00 - 14:45 (7h 45m overlap with shift 06:45-14:45)
      // Since overlap >= 6h, it compiles to penalty (soft constraint) and she remains assignable.
      await Constraint.create({
        userId: alice._id,
        weekId: WEEK_ID,
        entries: [
          {
            date: SUNDAY_LOCAL,
            definitionId: shiftDef._id,
            canWork: true,
            availabilityType: 'partial',
            startTime: '07:00',
            endTime: '14:45',
          },
        ],
        isLocked: true,
        submittedVia: 'self',
      });

      const res = await request(app)
        .post(`/api/v1/schedules/${WEEK_ID}/generate`)
        .set('Authorization', `Bearer ${makeToken(manager)}`);

      expect(res.status).toBe(200);

      // Verify solver request inputs
      const sent = solverStub.getLastRequest();
      expect(sent).not.toBeNull();

      const shift = await Shift.findOne({ definitionId: shiftDef._id });
      expect(shift).not.toBeNull();

      // Alice should NOT be in forbidden assignments
      const aliceForbidden = sent!.forbidden_assignments?.some(
        (f) => f.worker_id === alice._id.toString() && f.shift_id === shift!._id.toString()
      );
      expect(aliceForbidden).toBe(false);

      // Alice should be in penalties
      const alicePenalty = sent!.penalties?.some(
        (p) =>
          p.worker_id === alice._id.toString() &&
          p.shift_id === shift!._id.toString() &&
          p.category === 'assignment_preference'
      );
      expect(alicePenalty).toBe(true);

      // Verify she is assigned (since she's the first worker, and not forbidden)
      const assignments = await Assignment.find({ shiftId: shift!._id }).lean();
      expect(assignments).toHaveLength(1);
      expect(assignments[0].userId.toString()).toBe(alice._id.toString());
    });

    it('Rule 3: Standard unavailable constraint continues to forbid assignment', async () => {
      programSolverWithForbiddenLogic();

      // Alice is fully unavailable on Sunday morning shift
      await Constraint.create({
        userId: alice._id,
        weekId: WEEK_ID,
        entries: [
          {
            date: SUNDAY_LOCAL,
            definitionId: shiftDef._id,
            canWork: false,
          },
        ],
        isLocked: true,
        submittedVia: 'self',
      });

      const res = await request(app)
        .post(`/api/v1/schedules/${WEEK_ID}/generate`)
        .set('Authorization', `Bearer ${makeToken(manager)}`);

      expect(res.status).toBe(200);

      // Verify solver request inputs
      const sent = solverStub.getLastRequest();
      expect(sent).not.toBeNull();

      const shift = await Shift.findOne({ definitionId: shiftDef._id });
      expect(shift).not.toBeNull();

      // Alice should be in forbidden assignments
      const aliceForbidden = sent!.forbidden_assignments?.some(
        (f) => f.worker_id === alice._id.toString() && f.shift_id === shift!._id.toString()
      );
      expect(aliceForbidden).toBe(true);

      // Verify that Alice is NOT assigned (Bob is assigned instead)
      const assignments = await Assignment.find({ shiftId: shift!._id }).lean();
      expect(assignments).toHaveLength(1);
      expect(assignments[0].userId.toString()).toBe(bob._id.toString());
    });
  });
});
