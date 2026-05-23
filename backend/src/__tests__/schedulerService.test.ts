import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import Constraint from '../models/Constraint';
import AppError from '../utils/AppError';
import { runScheduler } from '../services/schedulerService';

// Mock the solver HTTP client — tests never call the Python service
jest.mock('../services/solverClient');
import { callSolver } from '../services/solverClient';
const mockCallSolver = callSolver as jest.MockedFunction<typeof callSolver>;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
  jest.resetAllMocks();
});

const WEEK_ID = '2026-W20';
const ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');

// ---- Seed helpers ----

async function seedSchedule(
  status: 'open' | 'locked' | 'generating' | 'draft' | 'published' = 'generating'
) {
  return WeeklySchedule.create({
    weekId: WEEK_ID,
    startDate: new Date(2026, 4, 10),
    endDate: new Date(2026, 4, 16),
    status,
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

async function seedEmployee(name = 'Alice') {
  return User.create({
    name,
    email: `${name.toLowerCase()}@test.com`,
    password: 'password123',
    role: 'employee',
    isActive: true,
    isFixedMorningEmployee: false,
  });
}

async function seedFullScenario() {
  const schedule = await seedSchedule();
  const def = await seedDefinition();
  const user = await seedEmployee();

  const shift = await Shift.create({
    scheduleId: schedule._id,
    definitionId: def._id,
    date: new Date(2026, 4, 10, 0, 0, 0, 0),
    requiredCount: 1,
    status: 'empty',
  });

  return { schedule, def, user, shift };
}

function makeOptimalResult(shiftId: string, userId: string) {
  return {
    status: 'OPTIMAL' as const,
    assignments: [{ shift_id: shiftId, worker_id: userId, assigned_by: 'algorithm' as const }],
    violations: [],
    warnings: [],
    solve_time_ms: 42,
  };
}

// ---- Tests ----

describe('runScheduler — OPTIMAL success path', () => {
  it('writes assignments, updates shift status, and creates audit log', async () => {
    const { schedule, shift, user } = await seedFullScenario();
    mockCallSolver.mockResolvedValueOnce(
      makeOptimalResult(shift._id.toString(), user._id.toString())
    );

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.violations).toEqual([]);

    const storedAssignment = await Assignment.findOne({ scheduleId: schedule._id });
    expect(storedAssignment).not.toBeNull();
    expect(storedAssignment!.assignedBy).toBe('algorithm');
    expect(storedAssignment!.status).toBe('pending');
    expect(storedAssignment!.shiftId.toString()).toBe(shift._id.toString());
    expect(storedAssignment!.userId.toString()).toBe(user._id.toString());

    const updatedShift = await Shift.findById(shift._id);
    expect(updatedShift!.status).toBe('filled');

    const auditLog = await AuditLog.findOne({ action: 'schedule_generated' });
    expect(auditLog).not.toBeNull();
    const after = auditLog!.after as Record<string, unknown>;
    expect(after.weekId).toBe(WEEK_ID);
    expect(after.solverStatus).toBe('OPTIMAL');
    expect(after.solveTimeMs).toBe(42);
    expect(after.warnings).toEqual([]);
    expect(after.violations).toEqual([]);
    expect(after.assignmentCount).toBe(1);
  });
});

describe('runScheduler — RELAXED path', () => {
  it('writes assignments and returns warnings without throwing', async () => {
    const { shift, user } = await seedFullScenario();
    mockCallSolver.mockResolvedValueOnce({
      status: 'RELAXED',
      assignments: [
        {
          shift_id: shift._id.toString(),
          worker_id: user._id.toString(),
          assigned_by: 'algorithm',
        },
      ],
      violations: [],
      warnings: [
        { constraint_id: 'MAXIMUM_LOAD', worker_id: null, message: 'Load constraint relaxed' },
      ],
      solve_time_ms: 100,
    });

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.status).toBe('RELAXED');
    expect(result.warnings).toHaveLength(1);
    expect(await Assignment.countDocuments()).toBe(1);

    const auditLog = await AuditLog.findOne({ action: 'schedule_generated' });
    expect(auditLog).not.toBeNull();
    const after = auditLog!.after as Record<string, unknown>;
    expect(after.solverStatus).toBe('RELAXED');
    expect(after.solveTimeMs).toBe(100);
    expect(after.warnings).toHaveLength(1);
    expect(after.violations).toEqual([]);
    expect(after.assignmentCount).toBe(1);
  });

  it('passes structured warning fields (type/severity/shift_ids) through unchanged', async () => {
    const { shift, user } = await seedFullScenario();
    mockCallSolver.mockResolvedValueOnce({
      status: 'FEASIBLE',
      assignments: [
        {
          shift_id: shift._id.toString(),
          worker_id: user._id.toString(),
          assigned_by: 'algorithm',
        },
      ],
      violations: [],
      warnings: [
        {
          constraint_id: 'ASSIGNMENT_PREFERENCE',
          type: 'ASSIGNMENT_PREFERENCE',
          severity: 'warning',
          worker_id: user._id.toString(),
          shift_ids: [shift._id.toString()],
          message: 'Worker assigned to a penalised shift.',
        },
      ],
      solve_time_ms: 50,
    });

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0];
    expect(warning.type).toBe('ASSIGNMENT_PREFERENCE');
    expect(warning.severity).toBe('warning');
    expect(warning.shift_ids).toEqual([shift._id.toString()]);
    expect(warning.worker_id).toBe(user._id.toString());
  });
});

describe('runScheduler — INFEASIBLE path', () => {
  it('throws AppError 422 and writes nothing to the database', async () => {
    await seedFullScenario();
    mockCallSolver.mockResolvedValueOnce({
      status: 'INFEASIBLE',
      assignments: [],
      violations: [
        { constraint_id: 'INFEASIBLE', shift_id: null, worker_id: null, message: 'No solution' },
      ],
      warnings: [],
      solve_time_ms: 5,
    });

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(await Assignment.countDocuments()).toBe(0);
    expect(await AuditLog.findOne({ action: 'schedule_generated' })).toBeNull();
  });
});

describe('runScheduler — solver timeout', () => {
  it('propagates AppError 504 and writes nothing', async () => {
    await seedFullScenario();
    mockCallSolver.mockRejectedValueOnce(new AppError('Solver timed out after 30000ms', 504));

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 504,
    });

    expect(await Assignment.countDocuments()).toBe(0);
  });
});

describe('runScheduler — solver network error', () => {
  it('propagates AppError 503 and writes nothing', async () => {
    await seedFullScenario();
    mockCallSolver.mockRejectedValueOnce(new AppError('Solver unavailable', 503));

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 503,
    });

    expect(await Assignment.countDocuments()).toBe(0);
  });
});

describe('runScheduler — guard: schedule not found', () => {
  it('throws AppError 404 before calling the solver', async () => {
    await expect(runScheduler('2026-W99', ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mockCallSolver).not.toHaveBeenCalled();
  });
});

describe('runScheduler — guard: non-generating schedule', () => {
  it('throws AppError 422 for published schedule without calling solver', async () => {
    await seedSchedule('published');
    await seedDefinition();
    await seedEmployee();

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockCallSolver).not.toHaveBeenCalled();
  });

  it('throws AppError 422 for open schedule (not yet generating)', async () => {
    await seedSchedule('open');
    await seedDefinition();
    await seedEmployee();

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockCallSolver).not.toHaveBeenCalled();
  });

  it('throws AppError 422 for locked schedule (not yet generating)', async () => {
    await seedSchedule('locked');
    await seedDefinition();
    await seedEmployee();

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockCallSolver).not.toHaveBeenCalled();
  });
});

describe('runScheduler — guard: no shifts', () => {
  it('throws AppError 422 when schedule has no shift slots', async () => {
    await seedSchedule();
    await seedEmployee();

    await expect(runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockCallSolver).not.toHaveBeenCalled();
  });
});

describe('runScheduler — dual-payload transport (PR #3)', () => {
  it('sends compiled forbidden_assignments, penalties, and relaxation_weights alongside legacy availability', async () => {
    const { schedule, shift, user } = await seedFullScenario();

    // Seed a canWork=false constraint so the compiler emits one
    // forbidden_assignments entry for this (worker, shift) cell.
    await Constraint.create({
      userId: user._id,
      weekId: WEEK_ID,
      entries: [{ date: shift.date, definitionId: shift.definitionId, canWork: false }],
      isLocked: true,
      submittedVia: 'self',
    });

    mockCallSolver.mockResolvedValueOnce(
      makeOptimalResult(shift._id.toString(), user._id.toString())
    );

    await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(mockCallSolver).toHaveBeenCalledTimes(1);
    const payload = mockCallSolver.mock.calls[0][0];

    // Legacy field still present — source of truth in PR #3.
    expect(payload.workers[0].availability).toEqual([
      {
        date: '2026-05-10',
        definition_id: shift.definitionId.toString(),
        can_work: false,
      },
    ]);

    // New generic payload appended.
    expect(payload.forbidden_assignments).toEqual([
      { worker_id: user._id.toString(), shift_id: shift._id.toString() },
    ]);
    expect(Array.isArray(payload.penalties)).toBe(true);
    expect(payload.relaxation_weights).toEqual({
      load: expect.any(Number),
      coverage: expect.any(Number),
    });

    // Schedule scheduleId reference used in stored docs.
    expect(payload.schedule_id).toBe(schedule._id.toString());
  });

  it('sends empty forbidden_assignments and penalties when no constraints exist', async () => {
    const { shift, user } = await seedFullScenario();
    mockCallSolver.mockResolvedValueOnce(
      makeOptimalResult(shift._id.toString(), user._id.toString())
    );

    await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    const payload = mockCallSolver.mock.calls[0][0];
    expect(payload.forbidden_assignments).toEqual([]);
    expect(payload.penalties).toEqual([]);
    expect(payload.relaxation_weights).toBeDefined();
  });
});

describe('runScheduler — idempotency', () => {
  it('replaces stale algorithm assignments on re-run, preserves manager assignments', async () => {
    const { schedule, shift, user } = await seedFullScenario();

    // Seed stale algorithm assignment from a previous run
    await Assignment.create({
      shiftId: shift._id,
      userId: user._id,
      scheduleId: schedule._id,
      assignedBy: 'algorithm',
      status: 'pending',
    });

    // Seed a manager-assigned entry that must NOT be deleted
    const managerEntry = await Assignment.create({
      shiftId: shift._id,
      userId: user._id,
      scheduleId: schedule._id,
      assignedBy: 'manager',
      status: 'confirmed',
    });

    mockCallSolver.mockResolvedValueOnce(
      makeOptimalResult(shift._id.toString(), user._id.toString())
    );

    const result = await runScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');
    expect(result.assignmentCount).toBe(1);

    // Manager-assigned entry must survive
    const managerStillThere = await Assignment.findById(managerEntry._id);
    expect(managerStillThere).not.toBeNull();

    // Exactly 2 total: 1 manager + 1 new algorithm
    expect(await Assignment.countDocuments({ scheduleId: schedule._id })).toBe(2);
  });
});
