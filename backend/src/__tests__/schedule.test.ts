import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import ShiftDefinition from '../models/ShiftDefinition';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
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

async function seedDraftSchedule() {
  return WeeklySchedule.create({
    weekId: TEST_WEEK,
    startDate: new Date('2026-05-10'),
    endDate: new Date('2026-05-16'),
    status: 'draft',
    generatedBy: 'manual',
  });
}

async function seedPublishedSchedule() {
  return WeeklySchedule.create({
    weekId: '2026-W21',
    startDate: new Date('2026-05-17'),
    endDate: new Date('2026-05-23'),
    status: 'published',
    generatedBy: 'manual',
  });
}

async function seedOpenSchedule() {
  return WeeklySchedule.create({
    weekId: TEST_WEEK,
    startDate: new Date('2026-05-10'),
    endDate: new Date('2026-05-16'),
    status: 'open',
    generatedBy: 'manual',
  });
}

async function seedLockedSchedule() {
  return WeeklySchedule.create({
    weekId: TEST_WEEK,
    startDate: new Date('2026-05-10'),
    endDate: new Date('2026-05-16'),
    status: 'locked',
    generatedBy: 'manual',
  });
}

describe('GET /api/v1/schedules', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/schedules');
    expect(res.status).toBe(401);
  });

  it('employee sees only published schedules', async () => {
    const { token } = await seedEmployee();
    await seedDraftSchedule();
    await seedPublishedSchedule();

    const res = await request(app).get('/api/v1/schedules').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.schedules.every((s: { status: string }) => s.status === 'published')).toBe(
      true
    );
  });

  it('manager sees all schedules', async () => {
    const { token } = await seedManager();
    await seedDraftSchedule();
    await seedPublishedSchedule();

    const res = await request(app).get('/api/v1/schedules').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.schedules.length).toBe(2);
  });
});

describe('POST /api/v1/schedules', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/v1/schedules')
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid weekId', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: 'bad-week', generatedBy: 'manual' });
    expect(res.status).toBe(400);
  });

  it('returns 409 if a published schedule already exists for the week', async () => {
    const { token } = await seedManager();
    await WeeklySchedule.create({
      weekId: TEST_WEEK,
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'published',
      generatedBy: 'manual',
    });
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(409);
  });

  it('returns 201 and re-generates if a draft schedule already exists for the week', async () => {
    const { manager, token } = await seedManager();
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    await seedDraftSchedule();
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'auto' });
    expect(res.status).toBe(201);
    const log = await AuditLog.findOne({ action: 'schedule_regenerated' });
    expect(log).not.toBeNull();
  });

  it('returns 201 and re-generates if an open schedule already exists for the week', async () => {
    const { manager, token } = await seedManager();
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    await seedOpenSchedule();
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'auto' });
    expect(res.status).toBe(201);
    const log = await AuditLog.findOne({ action: 'schedule_regenerated' });
    expect(log).not.toBeNull();
  });

  it('returns 409 if a locked schedule already exists for the week', async () => {
    const { token } = await seedManager();
    await seedLockedSchedule();
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(409);
  });

  it('manager can create a schedule and audit log is created', async () => {
    const { manager, token } = await seedManager();
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.schedule.weekId).toBe(TEST_WEEK);
    expect(res.body.schedule.status).toBe('open');

    const log = await AuditLog.findOne({ action: 'schedule_created' });
    expect(log).not.toBeNull();
  });
});

describe('GET /api/v1/schedules/:id', () => {
  it('returns 401 with no token', async () => {
    const schedule = await seedDraftSchedule();
    const res = await request(app).get(`/api/v1/schedules/${schedule._id}`);
    expect(res.status).toBe(401);
  });

  it('employee gets 403 for draft schedule', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('employee can access published schedule', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedPublishedSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('manager can access draft schedule', async () => {
    const { token } = await seedManager();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/schedules/:id (status transitions)', () => {
  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' });
    expect(res.status).toBe(403);
  });

  it('returns 422 for invalid transition (published → draft)', async () => {
    const { token } = await seedManager();
    const schedule = await seedPublishedSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' });
    expect(res.status).toBe(422);
  });

  it('publishing creates notifications for active employees', async () => {
    const { token } = await seedManager();
    await seedEmployee();
    const schedule = await seedDraftSchedule();

    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');

    const notifications = await Notification.find({ type: 'schedule_published' });
    expect(notifications.length).toBeGreaterThan(0);

    const log = await AuditLog.findOne({ action: 'schedule_updated' });
    expect(log).not.toBeNull();
  });
});

describe('DELETE /api/v1/schedules/:id', () => {
  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .delete(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 422 when deleting published schedule', async () => {
    const { token } = await seedManager();
    const schedule = await seedPublishedSchedule();
    const res = await request(app)
      .delete(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('deleting draft cascades shifts and assignments', async () => {
    const { manager, token } = await seedManager();
    const schedule = await seedDraftSchedule();
    const def = await ShiftDefinition.create({
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      orderNumber: 1,
      createdBy: manager._id,
    });
    const shift = await Shift.create({
      scheduleId: schedule._id,
      definitionId: def._id,
      date: new Date('2026-05-10'),
      requiredCount: 2,
      status: 'empty',
    });
    await Assignment.create({
      shiftId: shift._id,
      userId: manager._id,
      scheduleId: schedule._id,
      assignedBy: 'manager',
      status: 'pending',
    });

    const res = await request(app)
      .delete(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await Shift.findById(shift._id)).toBeNull();
    expect(await WeeklySchedule.findById(schedule._id)).toBeNull();

    const log = await AuditLog.findOne({ action: 'schedule_deleted' });
    expect(log).not.toBeNull();
  });

  it('deleting open schedule succeeds', async () => {
    const { token } = await seedManager();
    const schedule = await seedOpenSchedule();
    const res = await request(app)
      .delete(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(await WeeklySchedule.findById(schedule._id)).toBeNull();
  });
});

describe('5-state lifecycle transitions', () => {
  it('POST creates schedule with status open', async () => {
    const { manager, token } = await seedManager();
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK, generatedBy: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.schedule.status).toBe('open');
  });

  it('open → locked (valid PATCH)', async () => {
    const { token } = await seedManager();
    const schedule = await seedOpenSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'locked' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('locked');
  });

  it('locked → open (unlock, valid PATCH)', async () => {
    const { token } = await seedManager();
    const schedule = await seedLockedSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('open');
  });

  it('open → draft is invalid (422)', async () => {
    const { token } = await seedManager();
    const schedule = await seedOpenSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' });
    expect(res.status).toBe(422);
  });

  it('open → published is invalid (422)', async () => {
    const { token } = await seedManager();
    const schedule = await seedOpenSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' });
    expect(res.status).toBe(422);
  });

  it('locked → generating via PATCH is rejected (auto-only, 422)', async () => {
    const { token } = await seedManager();
    const schedule = await seedLockedSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'generating' });
    expect(res.status).toBe(422);
  });

  it('generating → draft via PATCH is rejected (auto-only, 422)', async () => {
    const { token } = await seedManager();
    const schedule = await WeeklySchedule.create({
      weekId: TEST_WEEK,
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'generating',
      generatedBy: 'manual',
    });
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' });
    expect(res.status).toBe(422);
  });

  it('employee gets 404 for open schedule', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedOpenSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('employee gets 404 for locked schedule', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedLockedSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('employee gets 404 for generating schedule', async () => {
    const { token } = await seedEmployee();
    const schedule = await WeeklySchedule.create({
      weekId: TEST_WEEK,
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'generating',
      generatedBy: 'manual',
    });
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('employee can access published schedule (regression)', async () => {
    const { token } = await seedEmployee();
    const schedule = await seedPublishedSchedule();
    const res = await request(app)
      .get(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('draft → open (manager resets week, valid PATCH)', async () => {
    const { token } = await seedManager();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('open');
  });

  it('draft → published is still valid (regression)', async () => {
    const { token } = await seedManager();
    await seedEmployee();
    const schedule = await seedDraftSchedule();
    const res = await request(app)
      .patch(`/api/v1/schedules/${schedule._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('published');
    const notifications = await Notification.find({ type: 'schedule_published' });
    expect(notifications.length).toBeGreaterThan(0);
  });
});
