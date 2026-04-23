import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';

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

async function seedManagerToken(): Promise<string> {
  const manager = await User.create({
    name: 'Manager',
    email: 'manager@example.com',
    password: 'managerpass1',
    role: 'manager',
  });
  return makeToken(manager);
}

async function seedAdminToken(): Promise<string> {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'adminpass123',
    role: 'admin',
  });
  return makeToken(admin);
}

async function seedEmployeeToken(): Promise<string> {
  const employee = await User.create({
    name: 'Employee',
    email: 'employee@example.com',
    password: 'employeepass1',
    role: 'employee',
  });
  return makeToken(employee);
}

// ── GET /api/v1/users ─────────────────────────────────────────────────────────

describe('GET /api/v1/users', () => {
  it('200 — manager can list all users sorted by name', async () => {
    const managerToken = await seedManagerToken();
    await User.create({ name: 'Zebra', email: 'z@example.com', password: 'password123' });
    await User.create({ name: 'Apple', email: 'a@example.com', password: 'password123' });

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const names: string[] = res.body.users.map((u: { name: string }) => u.name);
    expect(names).toEqual([...names].sort());
  });

  it('403 — employee token rejected', async () => {
    const employeeToken = await seedEmployeeToken();
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/users/:id/status (US-03) ───────────────────────────────────

describe('PATCH /api/v1/users/:id/status', () => {
  it('200 — manager deactivates active user', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.isActive).toBe(false);
  });

  it('200 — manager reactivates inactive user', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
      isActive: false,
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(true);
  });

  it('200 — admin can deactivate', async () => {
    const adminToken = await seedAdminToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
  });

  it('side-effect — deactivated user gets 403 on login', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
      role: 'employee',
    });

    await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: false });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@example.com', password: 'password123' });

    expect(loginRes.status).toBe(403);
  });

  it('403 — employee token rejected', async () => {
    const employeeToken = await seedEmployeeToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  it('401 — no token', async () => {
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .send({ isActive: false });

    expect(res.status).toBe(401);
  });

  it('404 — non-existent user ID', async () => {
    const managerToken = await seedManagerToken();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .patch(`/api/v1/users/${fakeId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });

  it('400 — invalid body (isActive is a string)', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: 'yes' });

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/users/:id/password (US-04) ─────────────────────────────────

describe('PATCH /api/v1/users/:id/password', () => {
  it('200 — manager resets password; new password works, old does not', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
      role: 'employee',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.password).toBeUndefined();

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@example.com', password: 'newpassword1' });
    expect(loginNew.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@example.com', password: 'oldpassword1' });
    expect(loginOld.status).toBe(401);
  });

  it('200 — admin can reset password', async () => {
    const adminToken = await seedAdminToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(200);
  });

  it('200 — manager can reset password for inactive user', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
      isActive: false,
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(200);
  });

  it('403 — employee token rejected', async () => {
    const employeeToken = await seedEmployeeToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(403);
  });

  it('401 — no token', async () => {
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(401);
  });

  it('404 — non-existent user ID', async () => {
    const managerToken = await seedManagerToken();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .patch(`/api/v1/users/${fakeId}/password`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'newpassword1' });

    expect(res.status).toBe(404);
  });

  it('400 — password too short', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'short' });

    expect(res.status).toBe(400);
  });

  it('400 — missing body / no password field', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'oldpassword1',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/password`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/users/:id/fixed-morning ────────────────────────────────────

describe('PATCH /api/v1/users/:id/fixed-morning', () => {
  it('200 — manager can toggle isFixedMorningEmployee', async () => {
    const managerToken = await seedManagerToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/fixed-morning`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isFixedMorningEmployee: true });

    expect(res.status).toBe(200);
    expect(res.body.user.isFixedMorningEmployee).toBe(true);
  });

  it('403 — employee rejected', async () => {
    const employeeToken = await seedEmployeeToken();
    const target = await User.create({
      name: 'Target',
      email: 'target@example.com',
      password: 'password123',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}/fixed-morning`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ isFixedMorningEmployee: true });

    expect(res.status).toBe(403);
  });
});
