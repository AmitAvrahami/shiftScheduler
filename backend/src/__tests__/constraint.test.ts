import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import ShiftDefinition from '../models/ShiftDefinition';
import Constraint from '../models/Constraint';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';

let mongoServer: MongoMemoryServer;

// Week 2026-W16: ISO Monday = 2026-04-13
// Deadline UTC  = 2026-04-13T20:59:59.999Z  (Mon 23:59:59.999 IST)
const TEST_WEEK = '2026-W16';
const BEFORE_DEADLINE = new Date('2026-04-13T18:00:00.000Z').getTime(); // Mon 21:00 IST
const AFTER_DEADLINE = new Date('2026-04-13T21:00:00.000Z').getTime(); // Tue 00:00 IST

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
  jest.restoreAllMocks();
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
    email: 'manager@example.com',
    password: 'managerpass1',
    role: 'manager',
  });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee() {
  const employee = await User.create({
    name: 'Employee',
    email: 'employee@example.com',
    password: 'employeepass1',
    role: 'employee',
  });
  return { employee, token: makeToken(employee) };
}

async function seedShiftDefinition(managerId: mongoose.Types.ObjectId) {
  return ShiftDefinition.create({
    name: 'בוקר',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFD700',
    isActive: true,
    orderNumber: 1,
    createdBy: managerId,
  });
}

// ── GET /api/v1/constraints/:weekId ──────────────────────────────────────────

describe('GET /api/v1/constraints/:weekId', () => {
  it('200 — returns null constraint with deadline when none exists', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee();

    const res = await request(app)
      .get(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.constraint).toBeNull();
    expect(res.body.deadline).toBe('2026-04-13T20:59:59.999Z');
    expect(res.body.isLocked).toBe(false);
  });

  it('200 — returns existing constraint document', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { manager } = await seedManager();
    const { employee, token } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    await Constraint.create({
      userId: employee._id,
      weekId: TEST_WEEK,
      entries: [{ date: '2026-04-12', definitionId: def._id, canWork: false }],
    });

    const res = await request(app)
      .get(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.constraint).not.toBeNull();
    expect(res.body.constraint.entries).toHaveLength(1);
  });

  it('200 — isLocked is true after deadline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { token } = await seedEmployee();

    const res = await request(app)
      .get(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isLocked).toBe(true);
  });

  it('400 — invalid weekId format', async () => {
    const { token } = await seedEmployee();

    const res = await request(app)
      .get('/api/v1/constraints/invalid-week')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('401 — no token', async () => {
    const res = await request(app).get(`/api/v1/constraints/${TEST_WEEK}`);
    expect(res.status).toBe(401);
  });
});

// ── PUT /api/v1/constraints/:weekId ──────────────────────────────────────────

describe('PUT /api/v1/constraints/:weekId', () => {
  it('200 — employee submits before deadline; submittedVia is "self"', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.constraint.submittedVia).toBe('self');
    expect(res.body.constraint.entries).toHaveLength(1);
  });

  it('403 — employee is blocked after deadline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    expect(res.status).toBe(403);
  });

  it('200 — manager can submit after deadline via own endpoint', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager, token } = await seedManager();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: false }] });

    expect(res.status).toBe(200);
  });

  it('200 — empty entries array accepted (clears constraints)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee();

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [] });

    expect(res.status).toBe(200);
    expect(res.body.constraint.entries).toHaveLength(0);
  });

  it('400 — invalid weekId format', async () => {
    const { token } = await seedEmployee();

    const res = await request(app)
      .put('/api/v1/constraints/bad-week-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [] });

    expect(res.status).toBe(400);
  });

  it('401 — no token', async () => {
    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .send({ entries: [] });

    expect(res.status).toBe(401);
  });
});

// ── PUT /api/v1/constraints/:weekId/users/:userId — manager override ──────────

describe('PUT /api/v1/constraints/:weekId/users/:userId — manager override', () => {
  it('200 — manager overrides employee constraint after deadline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager, token: managerToken } = await seedManager();
    const { employee } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}/users/${employee._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    expect(res.status).toBe(200);
    expect(res.body.constraint.submittedVia).toBe('manager_override');
    expect(res.body.constraint.overriddenBy).toBe(String(manager._id));
  });

  it('side-effect — AuditLog entry created with correct fields', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager, token: managerToken } = await seedManager();
    const { employee } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}/users/${employee._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    const log = await AuditLog.findOne({ targetUserId: employee._id });
    expect(log).not.toBeNull();
    expect(log!.action).toBe('constraint_override');
    expect(String(log!.performedBy)).toBe(String(manager._id));
    expect(log!.refModel).toBe('Constraint');
  });

  it('side-effect — Notification created with type constraint_updated', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager, token: managerToken } = await seedManager();
    const { employee } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}/users/${employee._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    const notif = await Notification.findOne({ userId: employee._id });
    expect(notif).not.toBeNull();
    expect(notif!.type).toBe('constraint_updated');
    expect(notif!.isRead).toBe(false);
  });

  it('403 — employee cannot use manager override route', async () => {
    const { manager } = await seedManager();
    const { employee, token: employeeToken } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}/users/${manager._id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ entries: [{ date: '2026-04-12', definitionId: String(def._id), canWork: false }] });

    expect(res.status).toBe(403);
  });

  it('404 — target user not found', async () => {
    const { manager, token: managerToken } = await seedManager();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}/users/${fakeId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [] });

    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/constraints/:weekId/users/:userId ─────────────────────────────

describe('GET /api/v1/constraints/:weekId/users/:userId', () => {
  it("200 — manager can read any user's constraints", async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { manager, token: managerToken } = await seedManager();
    const { employee } = await seedEmployee();
    const def = await seedShiftDefinition(manager._id as mongoose.Types.ObjectId);

    await Constraint.create({
      userId: employee._id,
      weekId: TEST_WEEK,
      entries: [{ date: '2026-04-12', definitionId: def._id, canWork: false }],
    });

    const res = await request(app)
      .get(`/api/v1/constraints/${TEST_WEEK}/users/${employee._id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.constraint.entries).toHaveLength(1);
  });

  it("403 — employee cannot read another user's constraints", async () => {
    const { manager } = await seedManager();
    const { token: employeeToken } = await seedEmployee();

    const res = await request(app)
      .get(`/api/v1/constraints/${TEST_WEEK}/users/${manager._id}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});
