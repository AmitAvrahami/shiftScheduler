import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import SystemSettings from '../models/SystemSettings';
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

async function seedSetting() {
  return SystemSettings.create({
    key: 'constraint_deadline',
    value: 'Monday 23:59',
    description: 'Constraint submission deadline',
  });
}

describe('GET /api/v1/settings', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('manager can list settings', async () => {
    await seedSetting();
    const { token } = await seedManager();
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.length).toBe(1);
  });
});

describe('GET /api/v1/settings/:key', () => {
  it('returns 404 for nonexistent key', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .get('/api/v1/settings/nonexistent_key')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('manager can fetch by key', async () => {
    await seedSetting();
    const { token } = await seedManager();
    const res = await request(app)
      .get('/api/v1/settings/constraint_deadline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.setting.key).toBe('constraint_deadline');
  });
});

describe('PUT /api/v1/settings/:key', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).put('/api/v1/settings/max_shifts').send({ value: 5 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token } = await seedEmployee();
    const res = await request(app)
      .put('/api/v1/settings/max_shifts')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 5 });
    expect(res.status).toBe(403);
  });

  it('returns 403 for manager (admin only)', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .put('/api/v1/settings/max_shifts')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 5 });
    expect(res.status).toBe(403);
  });

  it('admin can create a new setting and audit log is created', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .put('/api/v1/settings/max_shifts')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 5, description: 'Max shifts per week' });
    expect(res.status).toBe(200);
    expect(res.body.setting.key).toBe('max_shifts');
    expect(res.body.setting.value).toBe(5);
    const log = await AuditLog.findOne({ action: 'setting_updated' });
    expect(log).not.toBeNull();
  });

  it('admin can update existing setting', async () => {
    await seedSetting();
    const { token } = await seedAdmin();
    const res = await request(app)
      .put('/api/v1/settings/constraint_deadline')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'Sunday 20:00' });
    expect(res.status).toBe(200);
    expect(res.body.setting.value).toBe('Sunday 20:00');
  });
});

describe('DELETE /api/v1/settings/:key', () => {
  it('returns 403 for manager', async () => {
    await seedSetting();
    const { token } = await seedManager();
    const res = await request(app)
      .delete('/api/v1/settings/constraint_deadline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent key', async () => {
    const { token } = await seedAdmin();
    const res = await request(app)
      .delete('/api/v1/settings/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('admin can delete a setting and audit log is created', async () => {
    await seedSetting();
    const { token } = await seedAdmin();
    const res = await request(app)
      .delete('/api/v1/settings/constraint_deadline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(await SystemSettings.findOne({ key: 'constraint_deadline' })).toBeNull();
    const log = await AuditLog.findOne({ action: 'setting_deleted' });
    expect(log).not.toBeNull();
  });
});
