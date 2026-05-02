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

async function seedManager() {
  const manager = await User.create({ name: 'Manager', email: 'manager@test.com', password: 'pass12345', role: 'manager' });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee() {
  const employee = await User.create({ name: 'Employee', email: 'employee@test.com', password: 'pass12345', role: 'employee' });
  return { employee, token: makeToken(employee) };
}

async function seedData() {
  const manager = await User.create({ name: 'Mgr', email: 'mgr@test.com', password: 'pass12345', role: 'manager' });
  const def = await ShiftDefinition.create({ name: 'בוקר', startTime: '06:45', endTime: '14:45', durationMinutes: 480, crossesMidnight: false, color: '#FFD700', orderNumber: 1, createdBy: manager._id });
  const draft = await WeeklySchedule.create({ weekId: '2026-W22', startDate: new Date('2026-05-24'), endDate: new Date('2026-05-30'), status: 'draft', generatedBy: 'manual' });
  const published = await WeeklySchedule.create({ weekId: '2026-W23', startDate: new Date('2026-05-31'), endDate: new Date('2026-06-06'), status: 'published', generatedBy: 'manual' });
  return { manager, def, draft, published, token: makeToken(manager) };
}

describe('GET /api/v1/shifts', () => {
  it('returns 400 when scheduleId is missing', async () => {
    const { token } = await seedManager();
    const res = await request(app).get('/api/v1/shifts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/shifts?scheduleId=123');
    expect(res.status).toBe(401);
  });

  it('employee cannot see shifts for draft schedule', async () => {
    const { draft } = await seedData();
    const { token } = await seedEmployee();
    const res = await request(app).get(`/api/v1/shifts?scheduleId=${draft._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('employee can see shifts for published schedule', async () => {
    const { published } = await seedData();
    const { token } = await seedEmployee();
    const res = await request(app).get(`/api/v1/shifts?scheduleId=${published._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/shifts', () => {
  it('returns 403 for employee', async () => {
    const { draft, def } = await seedData();
    const { token } = await seedEmployee();
    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(draft._id), definitionId: String(def._id), date: '2026-05-24', requiredCount: 2 });
    expect(res.status).toBe(403);
  });

  it('returns 404 when scheduleId does not exist', async () => {
    const { def, token } = await seedData();
    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(new mongoose.Types.ObjectId()), definitionId: String(def._id), date: '2026-05-24', requiredCount: 2 });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid date format', async () => {
    const { draft, def, token } = await seedData();
    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(draft._id), definitionId: String(def._id), date: '24-05-2026', requiredCount: 2 });
    expect(res.status).toBe(400);
  });

  it('manager can create a shift and audit log is created', async () => {
    const { draft, def, token } = await seedData();
    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(draft._id), definitionId: String(def._id), date: '2026-05-24', requiredCount: 2 });
    expect(res.status).toBe(201);
    expect(res.body.shift.startTime).toBe(def.startTime);
    expect(res.body.shift.endTime).toBe(def.endTime);
    const log = await AuditLog.findOne({ action: 'shift_created' });
    expect(log).not.toBeNull();
  });

  it('accepts shiftDefinitionId as a frontend alias for definitionId', async () => {
    const { draft, def, token } = await seedData();
    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(draft._id), shiftDefinitionId: String(def._id), date: '2026-05-24', requiredCount: 2 });
    expect(res.status).toBe(201);
    expect(String(res.body.shift.definitionId)).toBe(String(def._id));
    expect(String(res.body.shift.shiftDefinitionId)).toBe(String(def._id));
  });

  it('keeps shift time snapshots immutable when the definition changes later', async () => {
    const { draft, def, token } = await seedData();
    const res = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${token}`)
      .send({ scheduleId: String(draft._id), definitionId: String(def._id), date: '2026-05-24', requiredCount: 2 });
    expect(res.status).toBe(201);

    await ShiftDefinition.findByIdAndUpdate(def._id, { $set: { startTime: '07:00', endTime: '15:00' } });
    const stored = await Shift.findById(res.body.shift._id).lean();

    expect(stored!.startTime).toBe('06:45');
    expect(stored!.endTime).toBe('14:45');
  });

  it('logs validation errors with a clear shift validation code', async () => {
    const { draft, token } = await seedData();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).post('/api/v1/shifts').set('Authorization', `Bearer ${token}`).send({ scheduleId: String(draft._id), date: '2026-05-24', requiredCount: 2 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_SHIFT_VALIDATION');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[shiftController] Failed to create shift: validation error'),
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ message: 'definitionId or shiftDefinitionId is required' }),
        ]),
      })
    );

    errorSpy.mockRestore();
  });
});

describe('PATCH /api/v1/shifts/:id', () => {
  it('returns 403 for employee', async () => {
    const { draft, def } = await seedData();
    const { token } = await seedEmployee();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    const res = await request(app).patch(`/api/v1/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`).send({ requiredCount: 3 });
    expect(res.status).toBe(403);
  });

  it('manager can update shift and audit log is created', async () => {
    const { draft, def, token } = await seedData();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    const res = await request(app).patch(`/api/v1/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`).send({ requiredCount: 5 });
    expect(res.status).toBe(200);
    expect(res.body.shift.requiredCount).toBe(5);
    const log = await AuditLog.findOne({ action: 'shift_updated' });
    expect(log).not.toBeNull();
  });

  it('supports PUT updates for schedule editors', async () => {
    const { draft, def, token } = await seedData();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    const res = await request(app).put(`/api/v1/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`).send({ shiftDefinitionId: String(def._id), requiredCount: 4 });
    expect(res.status).toBe(200);
    expect(res.body.shift.requiredCount).toBe(4);
    expect(String(res.body.shift.definitionId)).toBe(String(def._id));
  });

  it('supports legacy /api route prefix for shift saves', async () => {
    const { draft, def, token } = await seedData();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    const res = await request(app).put(`/api/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`).send({ requiredCount: 3 });
    expect(res.status).toBe(200);
    expect(res.body.shift.requiredCount).toBe(3);
  });
});

describe('DELETE /api/v1/shifts/:id', () => {
  it('returns 403 for employee', async () => {
    const { draft, def } = await seedData();
    const { token } = await seedEmployee();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    const res = await request(app).delete(`/api/v1/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('deleting shift cascades assignments and creates audit log', async () => {
    const { manager, draft, def, token } = await seedData();
    const shift = await Shift.create({ scheduleId: draft._id, definitionId: def._id, date: new Date('2026-05-24'), requiredCount: 2, status: 'empty' });
    await Assignment.create({ shiftId: shift._id, userId: manager._id, scheduleId: draft._id, assignedBy: 'manager', status: 'pending' });

    const res = await request(app).delete(`/api/v1/shifts/${shift._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await Shift.findById(shift._id)).toBeNull();
    expect(await Assignment.findOne({ shiftId: shift._id })).toBeNull();
    const log = await AuditLog.findOne({ action: 'shift_deleted' });
    expect(log).not.toBeNull();
  });
});
