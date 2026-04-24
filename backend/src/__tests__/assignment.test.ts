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

async function seedAll() {
  const manager = await User.create({ name: 'Manager', email: 'manager@test.com', password: 'pass12345', role: 'manager' });
  const employee = await User.create({ name: 'Employee', email: 'employee@test.com', password: 'pass12345', role: 'employee' });
  const def = await ShiftDefinition.create({ name: 'בוקר', startTime: '06:45', endTime: '14:45', durationMinutes: 480, crossesMidnight: false, color: '#FFD700', orderNumber: 1, createdBy: manager._id });
  const schedule = await WeeklySchedule.create({ weekId: '2026-W24', startDate: new Date('2026-06-07'), endDate: new Date('2026-06-13'), status: 'published', generatedBy: 'manual' });
  const shift = await Shift.create({ scheduleId: schedule._id, definitionId: def._id, date: new Date('2026-06-07'), requiredCount: 2, status: 'empty' });
  return {
    manager, employee, def, schedule, shift,
    managerToken: makeToken(manager),
    employeeToken: makeToken(employee),
  };
}

describe('GET /api/v1/assignments', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/assignments');
    expect(res.status).toBe(401);
  });

  it('manager sees all assignments', async () => {
    const { manager, employee, shift, schedule, managerToken } = await seedAll();
    await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    await Assignment.create({ shiftId: shift._id, userId: manager._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });

    const res = await request(app).get('/api/v1/assignments').set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.assignments.length).toBe(2);
  });

  it('employee sees only own assignments', async () => {
    const { manager, employee, shift, schedule, employeeToken } = await seedAll();
    await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    await Assignment.create({ shiftId: shift._id, userId: manager._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });

    const res = await request(app).get('/api/v1/assignments').set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.assignments.length).toBe(1);
    expect(String(res.body.assignments[0].userId)).toBe(String(employee._id));
  });
});

describe('POST /api/v1/assignments', () => {
  it('returns 403 for employee', async () => {
    const { shift, schedule, employee, employeeToken } = await seedAll();
    const res = await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${employeeToken}`).send({ shiftId: String(shift._id), userId: String(employee._id), scheduleId: String(schedule._id), assignedBy: 'manager' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when shift not found', async () => {
    const { employee, schedule, managerToken } = await seedAll();
    const res = await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${managerToken}`).send({ shiftId: String(new mongoose.Types.ObjectId()), userId: String(employee._id), scheduleId: String(schedule._id), assignedBy: 'manager' });
    expect(res.status).toBe(404);
  });

  it('manager can create assignment and audit log is created', async () => {
    const { shift, schedule, employee, managerToken } = await seedAll();
    const res = await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${managerToken}`).send({ shiftId: String(shift._id), userId: String(employee._id), scheduleId: String(schedule._id), assignedBy: 'manager' });
    expect(res.status).toBe(201);
    const log = await AuditLog.findOne({ action: 'assignment_created' });
    expect(log).not.toBeNull();
  });
});

describe('GET /api/v1/assignments/:id', () => {
  it('employee cannot access another employee\'s assignment', async () => {
    const { manager, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: manager._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(404);
  });

  it('employee can access own assignment', async () => {
    const { employee, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/assignments/:id', () => {
  it('employee can confirm own pending assignment', async () => {
    const { employee, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).patch(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.assignment.status).toBe('confirmed');
    const log = await AuditLog.findOne({ action: 'assignment_updated' });
    expect(log).not.toBeNull();
  });

  it('employee cannot update another employee\'s assignment', async () => {
    const { manager, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: manager._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).patch(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`).send({ status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  it('employee cannot set status to pending (employee schema allows only confirmed)', async () => {
    const { employee, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).patch(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`).send({ status: 'pending' });
    expect(res.status).toBe(400);
  });

  it('employee cannot re-confirm already confirmed assignment', async () => {
    const { employee, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'confirmed' });
    const res = await request(app).patch(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`).send({ status: 'confirmed' });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/assignments/:id', () => {
  it('returns 403 for employee', async () => {
    const { employee, shift, schedule, employeeToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).delete(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('manager can delete assignment and audit log is created', async () => {
    const { employee, shift, schedule, managerToken } = await seedAll();
    const assignment = await Assignment.create({ shiftId: shift._id, userId: employee._id, scheduleId: schedule._id, assignedBy: 'manager', status: 'pending' });
    const res = await request(app).delete(`/api/v1/assignments/${assignment._id}`).set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(await Assignment.findById(assignment._id)).toBeNull();
    const log = await AuditLog.findOne({ action: 'assignment_deleted' });
    expect(log).not.toBeNull();
  });
});
