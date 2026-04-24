import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import ShiftDefinition from '../models/ShiftDefinition';

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

async function seedManager() {
  const manager = await User.create({ name: 'Manager', email: 'manager@test.com', password: 'pass12345', role: 'manager' });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee() {
  const employee = await User.create({ name: 'Employee', email: 'employee@test.com', password: 'pass12345', role: 'employee' });
  return { employee, token: makeToken(employee) };
}

async function seedDefinition(managerId: mongoose.Types.ObjectId) {
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

const validPayload = {
  name: 'לילה',
  startTime: '22:00',
  endTime: '06:00',
  durationMinutes: 480,
  crossesMidnight: true,
  color: '#000080',
  orderNumber: 2,
};

describe('GET /api/v1/shift-definitions', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/shift-definitions');
    expect(res.status).toBe(401);
  });

  it('employee sees only active definitions', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    await seedDefinition(manager._id);
    await ShiftDefinition.create({ ...validPayload, isActive: false, createdBy: manager._id });

    const res = await request(app).get('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.definitions.every((d: { isActive: boolean }) => d.isActive)).toBe(true);
  });

  it('manager sees all definitions including inactive', async () => {
    const { manager, token } = await seedManager();
    await seedDefinition(manager._id);
    await ShiftDefinition.create({ ...validPayload, isActive: false, createdBy: manager._id });

    const res = await request(app).get('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.definitions.length).toBe(2);
  });
});

describe('POST /api/v1/shift-definitions', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/shift-definitions').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('returns 403 when employee tries to create', async () => {
    const { token } = await seedEmployee();
    const res = await request(app).post('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`).send(validPayload);
    expect(res.status).toBe(403);
  });

  it('returns 400 with invalid color', async () => {
    const { token } = await seedManager();
    const res = await request(app).post('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`).send({ ...validPayload, color: 'notahex' });
    expect(res.status).toBe(400);
  });

  it('returns 400 with invalid time format', async () => {
    const { token } = await seedManager();
    const res = await request(app).post('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`).send({ ...validPayload, startTime: '6:45' });
    expect(res.status).toBe(400);
  });

  it('manager can create a shift definition', async () => {
    const { token } = await seedManager();
    const res = await request(app).post('/api/v1/shift-definitions').set('Authorization', `Bearer ${token}`).send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.definition.name).toBe(validPayload.name);
  });
});

describe('GET /api/v1/shift-definitions/:id', () => {
  it('returns 401 with no token', async () => {
    const { manager } = await seedManager();
    const def = await seedDefinition(manager._id);
    const res = await request(app).get(`/api/v1/shift-definitions/${def._id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent id', async () => {
    const { token } = await seedEmployee();
    const res = await request(app).get(`/api/v1/shift-definitions/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('authenticated user can fetch by id', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const def = await seedDefinition(manager._id);
    const res = await request(app).get(`/api/v1/shift-definitions/${def._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.definition._id).toBe(String(def._id));
  });
});

describe('PATCH /api/v1/shift-definitions/:id', () => {
  it('returns 403 when employee tries to update', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const def = await seedDefinition(manager._id);
    const res = await request(app).patch(`/api/v1/shift-definitions/${def._id}`).set('Authorization', `Bearer ${token}`).send({ name: 'שונה' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent definition', async () => {
    const { token } = await seedManager();
    const res = await request(app).patch(`/api/v1/shift-definitions/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`).send({ name: 'שונה' });
    expect(res.status).toBe(404);
  });

  it('manager can update a shift definition', async () => {
    const { manager, token } = await seedManager();
    const def = await seedDefinition(manager._id);
    const res = await request(app).patch(`/api/v1/shift-definitions/${def._id}`).set('Authorization', `Bearer ${token}`).send({ name: 'עדכון' });
    expect(res.status).toBe(200);
    expect(res.body.definition.name).toBe('עדכון');
  });
});

describe('DELETE /api/v1/shift-definitions/:id', () => {
  it('returns 403 when employee tries to delete', async () => {
    const { manager } = await seedManager();
    const { token } = await seedEmployee();
    const def = await seedDefinition(manager._id);
    const res = await request(app).delete(`/api/v1/shift-definitions/${def._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent definition', async () => {
    const { token } = await seedManager();
    const res = await request(app).delete(`/api/v1/shift-definitions/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('manager soft-deletes (sets isActive=false)', async () => {
    const { manager, token } = await seedManager();
    const def = await seedDefinition(manager._id);
    const res = await request(app).delete(`/api/v1/shift-definitions/${def._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const updated = await ShiftDefinition.findById(def._id);
    expect(updated!.isActive).toBe(false);
  });
});
