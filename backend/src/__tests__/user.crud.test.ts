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

describe('GET /api/v1/users/:id', () => {
  it('returns 401 with no token', async () => {
    const { employee } = await seedEmployee();
    const res = await request(app).get(`/api/v1/users/${employee._id}`);
    expect(res.status).toBe(401);
  });

  it('employee gets 403 accessing another user', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const res = await request(app).get(`/api/v1/users/${manager._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('employee can access own profile', async () => {
    const { employee, token } = await seedEmployee();
    const res = await request(app).get(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user._id).toBe(String(employee._id));
  });

  it('manager can access any user', async () => {
    const { employee } = await seedEmployee();
    const { token } = await seedManager();
    const res = await request(app).get(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for nonexistent user', async () => {
    const { token } = await seedManager();
    const res = await request(app).get(`/api/v1/users/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('returns 401 with no token', async () => {
    const { employee } = await seedEmployee();
    const res = await request(app).patch(`/api/v1/users/${employee._id}`).send({ phone: '050-1234567' });
    expect(res.status).toBe(401);
  });

  it('employee gets 403 accessing another user', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const res = await request(app).patch(`/api/v1/users/${manager._id}`).set('Authorization', `Bearer ${token}`).send({ phone: '050-1234567' });
    expect(res.status).toBe(403);
  });

  it('employee can update own phone and avatarUrl', async () => {
    const { employee, token } = await seedEmployee();
    const res = await request(app).patch(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`).send({ phone: '050-1234567' });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('050-1234567');
  });

  it('employee cannot update name (not in self-update schema)', async () => {
    const { employee, token } = await seedEmployee();
    const res = await request(app).patch(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Hacker' });
    expect(res.status).toBe(200);
    const updated = await User.findById(employee._id);
    expect(updated!.name).toBe('Employee');
  });

  it('manager can update name', async () => {
    const { employee } = await seedEmployee();
    const { token } = await seedManager();
    const res = await request(app).patch(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
  });

  it('returns 400 for invalid avatarUrl', async () => {
    const { employee, token } = await seedEmployee();
    const res = await request(app).patch(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`).send({ avatarUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('returns 403 for manager (admin only)', async () => {
    const { employee } = await seedEmployee();
    const { token } = await seedManager();
    const res = await request(app).delete(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for employee', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const res = await request(app).delete(`/api/v1/users/${manager._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin cannot delete own account', async () => {
    const { admin, token } = await seedAdmin();
    const res = await request(app).delete(`/api/v1/users/${admin._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('admin can soft-delete another user', async () => {
    const { employee } = await seedEmployee();
    const { token } = await seedAdmin();
    const res = await request(app).delete(`/api/v1/users/${employee._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const updated = await User.findById(employee._id);
    expect(updated!.isActive).toBe(false);
  });

  it('returns 404 for nonexistent user', async () => {
    const { token } = await seedAdmin();
    const res = await request(app).delete(`/api/v1/users/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
