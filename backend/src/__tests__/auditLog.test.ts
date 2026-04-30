import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import AuditLog from '../models/AuditLog';

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
  return jwt.sign({ _id: String(user._id), email: user.email, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

async function seedAdmin() {
  const admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: 'pass12345', role: 'admin' });
  return { admin, token: makeToken(admin) };
}

async function seedManager() {
  const manager = await User.create({ name: 'Manager', email: 'manager@test.com', password: 'pass12345', role: 'manager' });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee() {
  const employee = await User.create({ name: 'Employee', email: 'employee@test.com', password: 'pass12345', role: 'employee' });
  return { employee, token: makeToken(employee) };
}

async function seedLog(performedById: mongoose.Types.ObjectId, action = 'test_action') {
  return AuditLog.create({ performedBy: performedById, action, ip: '127.0.0.1' });
}

describe('GET /api/v1/audit-logs', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const res = await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for manager (now allowed)', async () => {
    const { token } = await seedManager();
    const res = await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('admin can list audit logs with pagination', async () => {
    const { admin, token } = await seedAdmin();
    await seedLog(admin._id, 'action_a');
    await seedLog(admin._id, 'action_b');

    const res = await request(app).get('/api/v1/audit-logs?page=1&limit=10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('admin can filter logs by action', async () => {
    const { admin, token } = await seedAdmin();
    await seedLog(admin._id, 'schedule_created');
    await seedLog(admin._id, 'shift_deleted');

    const res = await request(app).get('/api/v1/audit-logs?action=schedule_created').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(1);
    expect(res.body.logs[0].action).toBe('schedule_created');
  });
});

describe('GET /api/v1/audit-logs/:id', () => {
  it('returns 403 for employee', async () => {
    const { admin } = await seedAdmin();
    const { token } = await seedEmployee();
    const log = await seedLog(admin._id);
    const res = await request(app).get(`/api/v1/audit-logs/${log._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for manager (now allowed)', async () => {
    const { admin } = await seedAdmin();
    const { token } = await seedManager();
    const log = await seedLog(admin._id);
    const res = await request(app).get(`/api/v1/audit-logs/${log._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for nonexistent log', async () => {
    const { token } = await seedAdmin();
    const res = await request(app).get(`/api/v1/audit-logs/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('admin can fetch a single audit log', async () => {
    const { admin, token } = await seedAdmin();
    const log = await seedLog(admin._id, 'setting_updated');
    const res = await request(app).get(`/api/v1/audit-logs/${log._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.log.action).toBe('setting_updated');
  });
});
