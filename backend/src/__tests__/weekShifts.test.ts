import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import { seedDefaultShiftDefinitions } from './helpers/shiftDefinitions';

let mongoServer: MongoMemoryServer;
const TEST_WEEK = '2026-W20';

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

async function seedManager() {
  const manager = await User.create({
    name: 'Manager',
    email: 'manager@test.com',
    password: 'pass12345',
    role: 'manager',
  });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee() {
  const employee = await User.create({
    name: 'Employee',
    email: 'employee@test.com',
    password: 'pass12345',
    role: 'employee',
  });
  return { employee, token: makeToken(employee) };
}

async function seedSchedule(status = 'open') {
  return WeeklySchedule.create({
    weekId: TEST_WEEK,
    startDate: new Date('2026-05-10'),
    endDate: new Date('2026-05-16'),
    status,
    generatedBy: 'manual',
  });
}

// ---- POST /api/v1/schedules/:weekId/shifts/initialize ----

describe('POST /api/v1/schedules/:weekId/shifts/initialize', () => {
  it('returns 401 without token', async () => {
    await seedSchedule();
    const res = await request(app).post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-manager', async () => {
    const { token } = await seedEmployee();
    await seedSchedule();
    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when no schedule exists for the week', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('manager can initialize shifts for an open week', async () => {
    const { manager, token } = await seedManager();
    await seedSchedule('open');
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBeGreaterThan(0);
    expect(res.body.skipped).toBe(0);
  });

  it('initialize is idempotent — second call skips existing shifts without duplicating', async () => {
    const { manager, token } = await seedManager();
    await seedSchedule('open');
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    const countAfterFirst = await Shift.countDocuments();

    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toBeGreaterThan(0);
    expect(await Shift.countDocuments()).toBe(countAfterFirst);
  });

  it('rejects initialization for a published week with 422', async () => {
    const { token } = await seedManager();
    await seedSchedule('published');

    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects initialization for an archived week with 422', async () => {
    const { token } = await seedManager();
    await seedSchedule('archived');

    const res = await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

// ---- GET /api/v1/schedules/:weekId/shifts ----

describe('GET /api/v1/schedules/:weekId/shifts', () => {
  it('returns 404 when no schedule exists for the week', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .get(`/api/v1/schedules/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns empty array when shifts are not yet materialized', async () => {
    const { token } = await seedManager();
    await seedSchedule('open');

    const res = await request(app)
      .get(`/api/v1/schedules/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.shifts).toHaveLength(0);
  });

  it('returns materialized shifts sorted by date', async () => {
    const { manager, token } = await seedManager();
    await seedSchedule('open');
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/schedules/${TEST_WEEK}/shifts/initialize`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/v1/schedules/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.shifts.length).toBeGreaterThan(0);

    const dates = res.body.shifts.map((s: { date: string }) => s.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

// ---- PATCH /api/v1/shifts/:shiftId/requirement ----

describe('PATCH /api/v1/shifts/:shiftId/requirement', () => {
  async function seedShift(
    scheduleId: mongoose.Types.ObjectId,
    managerId: mongoose.Types.ObjectId
  ) {
    const { morning } = await seedDefaultShiftDefinitions(managerId);
    return Shift.create({
      scheduleId,
      definitionId: morning._id,
      date: new Date('2026-05-10'),
      startTime: '06:45',
      endTime: '14:45',
      requiredCount: 2,
      status: 'empty',
    });
  }

  it('manager can update requiredCount', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedSchedule('open');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: 4 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.shift.requiredCount).toBe(4);

    const updated = await Shift.findById(shift._id);
    expect(updated!.requiredCount).toBe(4);
  });

  it('accepts requiredCount of 0', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedSchedule('open');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: 0 });

    expect(res.status).toBe(200);
    expect(res.body.shift.requiredCount).toBe(0);
  });

  it('rejects negative requiredCount with 422', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedSchedule('open');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: -1 });

    expect(res.status).toBe(422);
  });

  it('rejects float requiredCount with 422', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedSchedule('open');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: 1.5 });

    expect(res.status).toBe(422);
  });

  it('rejects update for shift in a published week with 422', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedSchedule('published');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: 3 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 for non-manager', async () => {
    const { manager } = await seedManager();
    const { token: employeeToken } = await seedEmployee();
    const schedule = await seedSchedule('open');
    const shift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      manager._id as mongoose.Types.ObjectId
    );

    const res = await request(app)
      .patch(`/api/v1/shifts/${shift._id}/requirement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ requiredCount: 3 });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent shift', async () => {
    const { token } = await seedManager();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .patch(`/api/v1/shifts/${fakeId}/requirement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requiredCount: 3 });

    expect(res.status).toBe(404);
  });
});
