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

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

function makeToken(user: { _id: unknown; email: string; role: string }): string {
  return jwt.sign(
    { _id: String(user._id), email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

async function seedPublishedScheduleView() {
  const manager = await User.create({
    name: 'Manager',
    email: 'manager@test.com',
    password: 'pass12345',
    role: 'manager',
  });
  const employee = await User.create({
    name: 'Employee',
    email: 'employee@test.com',
    password: 'pass12345',
    role: 'employee',
  });
  const otherEmployee = await User.create({
    name: 'Other Employee',
    email: 'other@test.com',
    password: 'pass12345',
    role: 'employee',
    isFixedMorningEmployee: true,
  });
  await User.create({
    name: 'Unassigned Employee',
    email: 'unassigned@test.com',
    password: 'pass12345',
    role: 'employee',
  });

  const morningDef = await ShiftDefinition.create({
    name: 'בוקר',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFD700',
    orderNumber: 1,
    createdBy: manager._id,
  });
  const nightDef = await ShiftDefinition.create({
    name: 'לילה',
    startTime: '22:00',
    endTime: '06:00',
    durationMinutes: 480,
    crossesMidnight: true,
    color: '#223344',
    orderNumber: 2,
    createdBy: manager._id,
  });

  const publishedAt = new Date('2026-06-06T12:00:00.000Z');
  const schedule = await WeeklySchedule.create({
    weekId: '2026-W24',
    startDate: new Date('2026-06-07'),
    endDate: new Date('2026-06-13'),
    status: 'published',
    generatedBy: 'manual',
    publishedAt,
  });

  const morningShift = await Shift.create({
    scheduleId: schedule._id,
    definitionId: morningDef._id,
    date: new Date('2026-06-07'),
    requiredCount: 2,
    status: 'partial',
  });
  const nightShift = await Shift.create({
    scheduleId: schedule._id,
    definitionId: nightDef._id,
    date: new Date('2026-06-08'),
    requiredCount: 1,
    status: 'filled',
  });

  const ownAssignment = await Assignment.create({
    shiftId: morningShift._id,
    userId: employee._id,
    scheduleId: schedule._id,
    assignedBy: 'manager',
    status: 'pending',
  });
  const otherAssignment = await Assignment.create({
    shiftId: nightShift._id,
    userId: otherEmployee._id,
    scheduleId: schedule._id,
    assignedBy: 'manager',
    status: 'pending',
  });

  return {
    manager,
    employee,
    otherEmployee,
    schedule,
    morningShift,
    nightShift,
    ownAssignment,
    otherAssignment,
    managerToken: makeToken(manager),
    employeeToken: makeToken(employee),
  };
}

describe('GET /api/v1/schedules/:id/published-view', () => {
  it('allows an employee to view the full published schedule without expanded user fields', async () => {
    const {
      employee,
      otherEmployee,
      schedule,
      morningShift,
      nightShift,
      ownAssignment,
      otherAssignment,
      employeeToken,
    } = await seedPublishedScheduleView();

    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}/published-view`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        schedule: {
          id: String(schedule._id),
          weekId: '2026-W24',
          status: 'published',
        },
      },
    });

    expect(res.body.data.shifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: String(morningShift._id),
          day: '2026-06-07',
          type: 'morning',
          requiredEmployees: 2,
        }),
        expect.objectContaining({
          id: String(nightShift._id),
          day: '2026-06-08',
          type: 'night',
          requiredEmployees: 1,
        }),
      ])
    );
    expect(res.body.data.assignments).toEqual(
      expect.arrayContaining([
        {
          id: String(ownAssignment._id),
          shiftId: String(morningShift._id),
          employeeId: String(employee._id),
        },
        {
          id: String(otherAssignment._id),
          shiftId: String(nightShift._id),
          employeeId: String(otherEmployee._id),
        },
      ])
    );
    expect(res.body.data.employees).toEqual(
      expect.arrayContaining([
        { id: String(employee._id), name: 'Employee' },
        { id: String(otherEmployee._id), name: 'Other Employee' },
      ])
    );
    expect(res.body.data.employees).toHaveLength(2);
    for (const returnedEmployee of res.body.data.employees) {
      expect(returnedEmployee).not.toHaveProperty('role');
      expect(returnedEmployee).not.toHaveProperty('isActive');
      expect(returnedEmployee).not.toHaveProperty('isFixedMorningEmployee');
    }
  });

  it.each(['draft', 'open', 'locked', 'generating'] as const)(
    'returns 403 for an employee when the schedule is %s',
    async (status) => {
      const { schedule, employeeToken } = await seedPublishedScheduleView();
      await WeeklySchedule.findByIdAndUpdate(schedule._id, { status });

      const res = await request(app)
        .get(`/api/v1/schedules/${schedule._id}/published-view`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    }
  );

  it('returns 404 for a missing schedule', async () => {
    const { employeeToken } = await seedPublishedScheduleView();

    const res = await request(app)
      .get(`/api/v1/schedules/${new mongoose.Types.ObjectId()}/published-view`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(404);
  });

  it('allows a manager to view the same published payload shape', async () => {
    const { schedule, managerToken } = await seedPublishedScheduleView();

    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}/published-view`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.schedule.status).toBe('published');
    expect(res.body.data.assignments).toHaveLength(2);
    for (const returnedEmployee of res.body.data.employees) {
      expect(Object.keys(returnedEmployee).sort()).toEqual(['id', 'name']);
    }
  });

  it('keeps GET /assignments scoped to the employee even for published schedules', async () => {
    const { employee, schedule, employeeToken } = await seedPublishedScheduleView();

    const res = await request(app)
      .get(`/api/v1/assignments?scheduleId=${schedule._id}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.assignments).toHaveLength(1);
    expect(String(res.body.assignments[0].userId)).toBe(String(employee._id));
  });
});
