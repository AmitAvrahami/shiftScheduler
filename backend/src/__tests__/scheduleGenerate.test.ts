import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import ShiftDefinition from '../models/ShiftDefinition';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import { callSolver } from '../services/solverClient';

jest.mock('../services/solverClient');

const mockCallSolver = callSolver as jest.MockedFunction<typeof callSolver>;

let mongoServer: MongoMemoryReplSet;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
  jest.resetAllMocks();
});

function makeToken(user: { _id: unknown; email: string; role: string }): string {
  return jwt.sign(
    { _id: String(user._id), email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

describe('POST /api/v1/schedules/:weekId/generate', () => {
  it('auto-populates shifts from blueprints before calling the solver', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'manager@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    await User.create({
      name: 'Employee',
      email: 'employee@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
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

    mockCallSolver.mockImplementationOnce(async (solveRequest) => {
      expect(solveRequest.shifts).toHaveLength(1);
      expect(solveRequest.shifts[0].date).toBe('2026-05-10');
      expect(solveRequest.shifts[0].required_count).toBe(1);

      return {
        status: 'OPTIMAL',
        assignments: [
          {
            shift_id: solveRequest.shifts[0].id,
            worker_id: solveRequest.workers[0].id,
            assigned_by: 'algorithm',
          },
        ],
        violations: [],
        warnings: [],
        solve_time_ms: 10,
      };
    });

    const res = await request(app)
      .post('/api/v1/schedules/2026-W20/generate')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(200);
    expect(await Shift.countDocuments()).toBe(1);

    const shift = await Shift.findOne().lean();
    expect(shift!.startsAt).toEqual(new Date(2026, 4, 10, 6, 45));
    expect(shift!.endsAt).toEqual(new Date(2026, 4, 10, 14, 45));

    const schedule = await WeeklySchedule.findOne({ weekId: '2026-W20' }).lean();
    expect(schedule!.status).toBe('draft');
  });

  it('fills missing template shifts when one shift already exists before calling the solver', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'manager2@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    await User.create({
      name: 'Employee',
      email: 'employee2@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    const schedule = await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16),
      status: 'open',
      generatedBy: 'manual',
    });
    const morningDef = await ShiftDefinition.create({
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
    await ShiftDefinition.create({
      name: 'ערב',
      startTime: '14:45',
      endTime: '22:45',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFA500',
      isActive: true,
      orderNumber: 2,
      createdBy: manager._id,
      requiredStaffCount: 1,
    });
    await Shift.create({
      scheduleId: schedule._id,
      definitionId: morningDef._id,
      date: new Date(2026, 4, 10),
      requiredCount: 1,
      status: 'empty',
    });

    mockCallSolver.mockImplementationOnce(async (solveRequest) => {
      expect(solveRequest.shifts).toHaveLength(2);

      return {
        status: 'OPTIMAL',
        assignments: [
          {
            shift_id: solveRequest.shifts[0].id,
            worker_id: solveRequest.workers[0].id,
            assigned_by: 'algorithm',
          },
          {
            shift_id: solveRequest.shifts[1].id,
            worker_id: solveRequest.workers[0].id,
            assigned_by: 'algorithm',
          },
        ],
        violations: [],
        warnings: [],
        solve_time_ms: 10,
      };
    });

    const res = await request(app)
      .post('/api/v1/schedules/2026-W20/generate')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(200);
    expect(await Shift.countDocuments({ scheduleId: schedule._id })).toBe(2);
  });

  it('returns 422 when no active templates exist and does not create an empty schedule', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'manager3@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });

    const res = await request(app)
      .post('/api/v1/schedules/2026-W20/generate')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ERR_NO_SHIFT_TEMPLATES');
    expect(await WeeklySchedule.countDocuments({ weekId: '2026-W20' })).toBe(0);
    expect(mockCallSolver).not.toHaveBeenCalled();
  });

  it('production /generate still rejects re-generating a published schedule (422)', async () => {
    const manager = await User.create({
      name: 'Published Manager',
      email: 'published-manager@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    await User.create({
      name: 'Published Employee',
      email: 'published-employee@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
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
    await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16),
      status: 'published',
      generatedBy: 'auto',
    });

    const res = await request(app)
      .post('/api/v1/schedules/2026-W20/generate')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Cannot re-generate a published schedule');
    expect(mockCallSolver).not.toHaveBeenCalled();
  });

  it('production regeneration clears manual assignments before writing solver output', async () => {
    const manager = await User.create({
      name: 'Regenerate Manager',
      email: 'regenerate-manager@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    const employeeA = await User.create({
      name: 'Regenerate Employee A',
      email: 'regenerate-employee-a@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    const employeeB = await User.create({
      name: 'Regenerate Employee B',
      email: 'regenerate-employee-b@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    const employeeC = await User.create({
      name: 'Regenerate Employee C',
      email: 'regenerate-employee-c@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    const morningDef = await ShiftDefinition.create({
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
    const eveningDef = await ShiftDefinition.create({
      name: 'ערב',
      startTime: '14:45',
      endTime: '22:45',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFA500',
      isActive: true,
      orderNumber: 2,
      createdBy: manager._id,
      requiredStaffCount: 1,
    });
    const schedule = await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16),
      status: 'draft',
      generatedBy: 'auto',
    });
    const morningShift = await Shift.create({
      scheduleId: schedule._id,
      definitionId: morningDef._id,
      date: new Date(2026, 4, 10),
      requiredCount: 1,
      status: 'filled',
    });
    const eveningShift = await Shift.create({
      scheduleId: schedule._id,
      definitionId: eveningDef._id,
      date: new Date(2026, 4, 10),
      requiredCount: 1,
      status: 'filled',
    });
    await Assignment.create({
      shiftId: morningShift._id,
      userId: employeeA._id,
      scheduleId: schedule._id,
      assignedBy: 'manager',
      status: 'pending',
    });
    await Assignment.create({
      shiftId: morningShift._id,
      userId: employeeB._id,
      scheduleId: schedule._id,
      assignedBy: 'manager',
      status: 'pending',
    });

    mockCallSolver.mockImplementationOnce(async (solveRequest) => ({
      status: 'OPTIMAL',
      assignments: [
        {
          shift_id: solveRequest.shifts.find((shift) => shift.id === String(morningShift._id))!.id,
          worker_id: String(employeeC._id),
          assigned_by: 'algorithm',
        },
        {
          shift_id: solveRequest.shifts.find((shift) => shift.id === String(eveningShift._id))!.id,
          worker_id: String(employeeA._id),
          assigned_by: 'algorithm',
        },
      ],
      violations: [],
      warnings: [],
      solve_time_ms: 10,
    }));

    const res = await request(app)
      .post('/api/v1/schedules/2026-W20/generate')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(200);
    expect(
      await Assignment.countDocuments({ scheduleId: schedule._id, assignedBy: 'manager' })
    ).toBe(0);

    const shifts = await Shift.find({ scheduleId: schedule._id }).lean();
    for (const shift of shifts) {
      const assignmentCount = await Assignment.countDocuments({
        scheduleId: schedule._id,
        shiftId: shift._id,
      });
      expect(assignmentCount).toBeLessThanOrEqual(shift.requiredCount);
    }
  });
});

describe('POST /api/v1/schedules/:weekId/generate-demo', () => {
  it('materializes shifts and generates demo assignments without calling the solver', async () => {
    const manager = await User.create({
      name: 'Demo Manager',
      email: 'demo-manager@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    await User.create({
      name: 'Demo Employee',
      email: 'demo-employee@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
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
      .post('/api/v1/schedules/2026-W20/generate-demo')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      status: 'OPTIMAL',
      assignmentCount: 1,
      violations: [],
    });
    expect(mockCallSolver).not.toHaveBeenCalled();

    const schedule = await WeeklySchedule.findOne({ weekId: '2026-W20' }).lean();
    expect(schedule!.status).toBe('draft');
    expect(await Shift.countDocuments({ scheduleId: schedule!._id })).toBe(1);
  });

  it('regenerates demo assignments on an already-published schedule, preserving manual assignments', async () => {
    const manager = await User.create({
      name: 'Demo Published Manager',
      email: 'demo-published-manager@test.com',
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    const employee = await User.create({
      name: 'Demo Published Employee',
      email: 'demo-published-employee@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
    await User.create({
      name: 'Demo Published Employee 2',
      email: 'demo-published-employee-2@test.com',
      password: 'Password123!',
      role: 'employee',
      isActive: true,
      isFixedMorningEmployee: false,
    });
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
      requiredStaffCount: 2,
    });

    const firstRes = await request(app)
      .post('/api/v1/schedules/2026-W20/generate-demo')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(firstRes.status).toBe(200);

    const schedule = await WeeklySchedule.findOne({ weekId: '2026-W20' }).lean();
    expect(schedule!.status).toBe('draft');

    await WeeklySchedule.findByIdAndUpdate(schedule!._id, { $set: { status: 'published' } });

    const shift = await Shift.findOne({ scheduleId: schedule!._id }).lean();
    const manualAssignment = await Assignment.create({
      shiftId: shift!._id,
      userId: employee._id,
      scheduleId: schedule!._id,
      assignedBy: 'manager',
      status: 'pending',
    });

    const algorithmAssignment = await Assignment.findOne({
      scheduleId: schedule!._id,
      assignedBy: 'algorithm',
    }).lean();
    expect(algorithmAssignment).not.toBeNull();
    const replacedAlgorithmAssignmentId = algorithmAssignment!._id;

    const secondRes = await request(app)
      .post('/api/v1/schedules/2026-W20/generate-demo')
      .set('Authorization', `Bearer ${makeToken(manager)}`);

    expect(secondRes.status).toBe(200);

    const regeneratedSchedule = await WeeklySchedule.findOne({ weekId: '2026-W20' }).lean();
    expect(regeneratedSchedule!.status).toBe('draft');
    expect(await Assignment.findById(manualAssignment._id)).not.toBeNull();
    expect(await Assignment.findById(replacedAlgorithmAssignmentId)).toBeNull();
    expect(mockCallSolver).not.toHaveBeenCalled();
  });
});
