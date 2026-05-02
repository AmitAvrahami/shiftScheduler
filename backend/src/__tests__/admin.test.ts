import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import AuditLog from '../models/AuditLog';
import { getCurrentWeekId } from '../utils/weekUtils';

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

async function seedAdmin() {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'pass12345',
    role: 'admin',
  });
  return { admin, token: makeToken(admin) };
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

describe('GET /api/v1/admin/dashboard — access control', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee token', async () => {
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for manager token', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for admin token', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/admin/dashboard — response shape', () => {
  it('returns all BFF top-level keys', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toHaveProperty('users');
    expect(res.body.data).toHaveProperty('shiftDefinitions');
    expect(res.body.data).toHaveProperty('currentWeek');
    expect(res.body.data).toHaveProperty('nextWeek');
    expect(res.body.data).toHaveProperty('recentAuditLogs');
    expect(res.body.data).toHaveProperty('meta');
  });

  it('users has all[] and stats sub-keys', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    const { users } = res.body.data;
    expect(Array.isArray(users.all)).toBe(true);
    expect(typeof users.stats.total).toBe('number');
    expect(typeof users.stats.active).toBe('number');
    expect(users.stats.byRole).toHaveProperty('employee');
    expect(users.stats.byRole).toHaveProperty('manager');
    expect(users.stats.byRole).toHaveProperty('admin');
  });

  it('currentWeek has required structure', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    const { currentWeek } = res.body.data;
    expect(typeof currentWeek.weekId).toBe('string');
    expect(Array.isArray(currentWeek.shifts)).toBe(true);
    expect(Array.isArray(currentWeek.assignments)).toBe(true);
    expect(typeof currentWeek.stats.total).toBe('number');
    expect(typeof currentWeek.stats.filled).toBe('number');
    expect(typeof currentWeek.stats.partial).toBe('number');
    expect(typeof currentWeek.stats.empty).toBe('number');
  });

  it('nextWeek has weekId and missingConstraintUserIds', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    const { nextWeek } = res.body.data;
    expect(typeof nextWeek.weekId).toBe('string');
    expect(Array.isArray(nextWeek.missingConstraintUserIds)).toBe(true);
  });

  it('recentAuditLogs is an array', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body.data.recentAuditLogs)).toBe(true);
  });

  it('meta.queryTimeMs is a number', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(typeof res.body.data.meta.queryTimeMs).toBe('number');
  });
});

describe('GET /api/v1/admin/dashboard — data accuracy', () => {
  it('counts users correctly after seeding', async () => {
    const { admin, token } = await seedAdmin();
    await seedManager();
    await seedEmployee();

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    const { users } = res.body.data;
    expect(users.stats.total).toBe(3);
    expect(users.stats.active).toBe(3);
    expect(users.stats.byRole.admin).toBe(1);
    expect(users.stats.byRole.manager).toBe(1);
    expect(users.stats.byRole.employee).toBe(1);
    expect(users.all.length).toBe(3);
    expect(users.all.every((u: Record<string, unknown>) => !('password' in u))).toBe(true);

    void admin;
  });

  it('inactive users are excluded from active count', async () => {
    const { token } = await seedAdmin();
    await User.create({
      name: 'Inactive',
      email: 'inactive@test.com',
      password: 'pass12345',
      role: 'employee',
      isActive: false,
    });

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    const { users } = res.body.data;
    expect(users.stats.total).toBe(2);
    expect(users.stats.active).toBe(1);
  });

  it('active employees with no constraint appear in missingConstraintUserIds', async () => {
    const { token } = await seedAdmin();
    await seedEmployee();

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.nextWeek.missingConstraintUserIds.length).toBe(1);
  });

  it('currentWeek returns null schedule and empty arrays when none exists', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    const { currentWeek } = res.body.data;
    expect(currentWeek.schedule).toBeNull();
    expect(currentWeek.shifts).toHaveLength(0);
    expect(currentWeek.assignments).toHaveLength(0);
    expect(currentWeek.stats.total).toBe(0);
    expect(currentWeek.stats.scheduleStatus).toBeNull();
  });

  it('currentWeek reflects schedule seeded for the current weekId', async () => {
    const { token, admin } = await seedAdmin();
    const weekId = getCurrentWeekId();

    await WeeklySchedule.create({
      weekId,
      startDate: new Date(),
      endDate: new Date(),
      status: 'draft',
      generatedBy: 'auto',
      createdBy: admin._id,
    });

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.currentWeek.schedule).not.toBeNull();
    expect(res.body.data.currentWeek.stats.scheduleStatus).toBe('draft');
  });

  it('recentAuditLogs returns at most 8 entries', async () => {
    const { token, admin } = await seedAdmin();
    const logs = Array.from({ length: 12 }, (_, i) => ({
      performedBy: admin._id,
      action: `action_${i}`,
    }));
    await AuditLog.insertMany(logs);

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.recentAuditLogs.length).toBeLessThanOrEqual(8);
  });

  it('recentAuditLogs entries have action, performedBy.name, createdAt', async () => {
    const { token, admin } = await seedAdmin();
    await AuditLog.create({ performedBy: admin._id, action: 'user_created' });

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    const [log] = res.body.data.recentAuditLogs;
    expect(log).toHaveProperty('action', 'user_created');
    expect(log.performedBy).toHaveProperty('name', 'Admin');
    expect(log).toHaveProperty('createdAt');
  });
});
