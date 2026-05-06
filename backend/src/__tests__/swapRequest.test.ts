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
import SwapRequest from '../models/SwapRequest';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';

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

async function seedAll() {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'pass12345',
    role: 'admin',
  });
  const manager = await User.create({
    name: 'Manager',
    email: 'manager@test.com',
    password: 'pass12345',
    role: 'manager',
  });
  const emp1 = await User.create({
    name: 'Emp1',
    email: 'emp1@test.com',
    password: 'pass12345',
    role: 'employee',
  });
  const emp2 = await User.create({
    name: 'Emp2',
    email: 'emp2@test.com',
    password: 'pass12345',
    role: 'employee',
  });
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
  const schedule = await WeeklySchedule.create({
    weekId: '2026-W25',
    startDate: new Date('2026-06-14'),
    endDate: new Date('2026-06-20'),
    status: 'published',
    generatedBy: 'manual',
  });
  const shift1 = await Shift.create({
    scheduleId: schedule._id,
    definitionId: def._id,
    date: new Date('2026-06-14'),
    requiredCount: 2,
    status: 'empty',
  });
  const shift2 = await Shift.create({
    scheduleId: schedule._id,
    definitionId: def._id,
    date: new Date('2026-06-15'),
    requiredCount: 2,
    status: 'empty',
  });
  const a1 = await Assignment.create({
    shiftId: shift1._id,
    userId: emp1._id,
    scheduleId: schedule._id,
    assignedBy: 'manager',
    status: 'pending',
  });
  const a2 = await Assignment.create({
    shiftId: shift2._id,
    userId: emp2._id,
    scheduleId: schedule._id,
    assignedBy: 'manager',
    status: 'pending',
  });
  return {
    admin,
    manager,
    emp1,
    emp2,
    a1,
    a2,
    adminToken: makeToken(admin),
    managerToken: makeToken(manager),
    emp1Token: makeToken(emp1),
    emp2Token: makeToken(emp2),
  };
}

describe('POST /api/v1/swap-requests', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/swap-requests').send({});
    expect(res.status).toBe(401);
  });

  it('returns 404 if requesterShiftId does not exist', async () => {
    const { emp2, a2, emp1Token } = await seedAll();
    const res = await request(app)
      .post('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${emp1Token}`)
      .send({
        targetUserId: String(emp2._id),
        requesterShiftId: String(new mongoose.Types.ObjectId()),
        targetShiftId: String(a2._id),
      });
    expect(res.status).toBe(404);
  });

  it("returns 403 if employee uses another employee's assignment as their own", async () => {
    const { emp1, emp2, a1, a2, emp2Token } = await seedAll();
    // emp2 tries to use a1 (which belongs to emp1) as their requester shift — should be 403
    const res = await request(app)
      .post('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${emp2Token}`)
      .send({
        targetUserId: String(emp1._id),
        requesterShiftId: String(a1._id),
        targetShiftId: String(a2._id),
      });
    expect(res.status).toBe(403);
  });

  it('employee can create a swap request and audit log is created', async () => {
    const { emp1, emp2, a1, a2, emp1Token } = await seedAll();
    const res = await request(app)
      .post('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${emp1Token}`)
      .send({
        targetUserId: String(emp2._id),
        requesterShiftId: String(a1._id),
        targetShiftId: String(a2._id),
        requesterNote: 'Please swap',
      });
    expect(res.status).toBe(201);
    expect(res.body.swapRequest.status).toBe('pending');
    const log = await AuditLog.findOne({ action: 'swap_request_created' });
    expect(log).not.toBeNull();
  });
});

describe('GET /api/v1/swap-requests', () => {
  it('manager sees all swap requests', async () => {
    const { emp1, emp2, a1, a2, emp1Token, managerToken } = await seedAll();
    await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .get('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.swapRequests.length).toBe(1);
  });

  it('employee sees only own (as requester or target)', async () => {
    const { emp1, emp2, a1, a2, emp1Token } = await seedAll();
    await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });

    const emp3 = await User.create({
      name: 'Emp3',
      email: 'emp3@test.com',
      password: 'pass12345',
      role: 'employee',
    });
    const emp3Token = makeToken(emp3);

    const ownRes = await request(app)
      .get('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${emp1Token}`);
    expect(ownRes.body.swapRequests.length).toBe(1);

    const unrelatedRes = await request(app)
      .get('/api/v1/swap-requests')
      .set('Authorization', `Bearer ${emp3Token}`);
    expect(unrelatedRes.body.swapRequests.length).toBe(0);
  });
});

describe('GET /api/v1/swap-requests/:id', () => {
  it('unrelated employee gets 404', async () => {
    const { emp1, emp2, a1, a2 } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const emp3 = await User.create({
      name: 'Emp3',
      email: 'emp3@test.com',
      password: 'pass12345',
      role: 'employee',
    });
    const emp3Token = makeToken(emp3);
    const res = await request(app)
      .get(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${emp3Token}`);
    expect(res.status).toBe(404);
  });

  it('participant can access their swap request', async () => {
    const { emp1, emp2, a1, a2, emp2Token } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .get(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${emp2Token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/swap-requests/:id (manager review)', () => {
  it('requester employee cannot approve their own swap request (only cancel with status: rejected)', async () => {
    const { emp1, emp2, a1, a2, emp1Token } = await seedAll();
    // emp1 is the requester — they can cancel (rejected) but not approve
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .patch(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${emp1Token}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(400);
  });

  it('manager approves swap request, creates notification and audit log', async () => {
    const { emp1, emp2, a1, a2, managerToken } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .patch(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', managerNote: 'Approved' });
    expect(res.status).toBe(200);
    expect(res.body.swapRequest.status).toBe('approved');

    const notification = await Notification.findOne({
      type: 'swap_request_reviewed',
      userId: emp1._id,
    });
    expect(notification).not.toBeNull();

    const log = await AuditLog.findOne({ action: 'swap_request_reviewed' });
    expect(log).not.toBeNull();
  });

  it('cannot update non-pending swap request', async () => {
    const { emp1, emp2, a1, a2, managerToken } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'approved',
    });
    const res = await request(app)
      .patch(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'rejected' });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/swap-requests/:id', () => {
  it('returns 403 for employee', async () => {
    const { emp1, emp2, a1, a2, emp1Token } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .delete(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${emp1Token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for manager', async () => {
    const { emp1, emp2, a1, a2, managerToken } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .delete(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can hard-delete a swap request and audit log is created', async () => {
    const { emp1, emp2, a1, a2, adminToken } = await seedAll();
    const swap = await SwapRequest.create({
      requesterId: emp1._id,
      targetUserId: emp2._id,
      requesterShiftId: a1._id,
      targetShiftId: a2._id,
      status: 'pending',
    });
    const res = await request(app)
      .delete(`/api/v1/swap-requests/${swap._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(await SwapRequest.findById(swap._id)).toBeNull();
    const log = await AuditLog.findOne({ action: 'swap_request_deleted' });
    expect(log).not.toBeNull();
  });
});
