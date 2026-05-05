import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Constraint from '../models/Constraint';
import ConstraintException from '../models/ConstraintException';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import ShiftDefinition from '../models/ShiftDefinition';
import SystemSettings from '../models/SystemSettings';
import AuditLog from '../models/AuditLog';
import { runLockNow } from '../services/cronService';
import { seedDefaultShiftDefinitions } from './helpers/shiftDefinitions';

let mongoServer: MongoMemoryServer;

// Week 2026-W16: ISO Monday = 2026-04-13
// Deadline UTC  = 2026-04-13T20:59:59.999Z  (Mon 23:59:59.999 IST)
const TEST_WEEK = '2026-W16';
const NEXT_WEEK = '2026-W17';
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

async function seedManager(suffix = '') {
  const manager = await User.create({
    name: 'Manager',
    email: `manager${suffix}@test.com`,
    password: 'pass12345',
    role: 'manager',
  });
  return { manager, token: makeToken(manager) };
}

async function seedEmployee(suffix = '') {
  const employee = await User.create({
    name: `Employee${suffix}`,
    email: `employee${suffix}@test.com`,
    password: 'pass12345',
    role: 'employee',
  });
  return { employee, token: makeToken(employee) };
}

async function seedShiftDef(managerId: mongoose.Types.ObjectId) {
  return ShiftDefinition.create({
    name: 'בוקר',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFD700',
    orderNumber: 1,
    createdBy: managerId,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Group 1: GET /api/v1/workflow/status
// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/workflow/status', () => {
  it('1.1 — returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/workflow/status');
    expect(res.status).toBe(401);
  });

  it('1.2 — before deadline: isConstraintWindowLocked false, workflowState null, no activeSchedule', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.isConstraintWindowLocked).toBe(false);
    expect(res.body.workflow.workflowState).toBeNull();
    expect(res.body.workflow.activeSchedule).toBeNull();
  });

  it('1.3 — after deadline with workflow_state in DB: returns locked state', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    await SystemSettings.create({ key: 'workflow_state', value: 'constraint_locked' });
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.isConstraintWindowLocked).toBe(true);
    expect(res.body.workflow.workflowState).toBe('constraint_locked');
  });

  it('1.4 — returns draft activeSchedule for current week', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    await WeeklySchedule.create({
      weekId: TEST_WEEK,
      startDate: new Date('2026-04-12'),
      endDate: new Date('2026-04-18'),
      status: 'draft',
      generatedBy: 'manual',
    });
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.activeSchedule).not.toBeNull();
    expect(res.body.workflow.activeSchedule.status).toBe('draft');
  });

  it('1.5 — published schedule and workflow_state schedule_published both returned', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    await SystemSettings.create({ key: 'workflow_state', value: 'schedule_published' });
    await WeeklySchedule.create({
      weekId: TEST_WEEK,
      startDate: new Date('2026-04-12'),
      endDate: new Date('2026-04-18'),
      status: 'published',
      generatedBy: 'auto',
      publishedAt: new Date(),
    });
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.workflowState).toBe('schedule_published');
    expect(res.body.workflow.activeSchedule.status).toBe('published');
  });

  it('1.6 — constraintDeadline is correct ISO string for 2026-W16', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.constraintDeadline).toBe('2026-04-13T20:59:59.999Z');
  });

  it('1.7 — employee token returns 200 (no isManager gate)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee();
    const res = await request(app)
      .get('/api/v1/workflow/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 2: runLockNow() — constraint locking logic
// ────────────────────────────────────────────────────────────────────────────

describe('runLockNow()', () => {
  it('2.1 — locks all constraints for current week', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee } = await seedEmployee();
    await Constraint.create([
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
    ]);
    await runLockNow();
    const constraints = await Constraint.find({ weekId: TEST_WEEK });
    expect(constraints.every((c) => c.isLocked)).toBe(true);
  });

  it('2.2 — does not lock constraints for other weeks', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee } = await seedEmployee();
    await Constraint.create([
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
      {
        userId: employee._id,
        weekId: NEXT_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
    ]);
    await runLockNow();
    const w16 = await Constraint.findOne({ weekId: TEST_WEEK });
    const w17 = await Constraint.findOne({ weekId: NEXT_WEEK });
    expect(w16!.isLocked).toBe(true);
    expect(w17!.isLocked).toBe(false);
  });

  it('2.3 — upserts SystemSettings workflow_state to constraint_locked', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    await runLockNow();
    const setting = await SystemSettings.findOne({ key: 'workflow_state' });
    expect(setting!.value).toBe('constraint_locked');
  });

  it('2.4 — creates AuditLog with action constraint_window_locked and correct lockedCount', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee } = await seedEmployee();
    await Constraint.create([
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
      {
        userId: employee._id,
        weekId: TEST_WEEK,
        isLocked: false,
        submittedVia: 'self',
        submittedAt: new Date(),
        entries: [],
      },
    ]);
    await runLockNow();
    const log = await AuditLog.findOne({ action: 'constraint_window_locked' });
    expect(log).not.toBeNull();
    expect((log!.after as { weekId: string; lockedCount: number }).weekId).toBe(TEST_WEEK);
    expect((log!.after as { weekId: string; lockedCount: number }).lockedCount).toBe(2);
  });

  it('2.5 — idempotent: calling twice creates only one AuditLog entry', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    await runLockNow();
    await runLockNow();
    const logs = await AuditLog.find({ action: 'constraint_window_locked' });
    expect(logs).toHaveLength(1);
  });

  it('2.6 — before deadline: does nothing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { employee } = await seedEmployee();
    await Constraint.create({
      userId: employee._id,
      weekId: TEST_WEEK,
      isLocked: false,
      submittedVia: 'self',
      submittedAt: new Date(),
      entries: [],
    });
    await runLockNow();
    const constraint = await Constraint.findOne({ weekId: TEST_WEEK });
    expect(constraint!.isLocked).toBe(false);
    const setting = await SystemSettings.findOne({ key: 'workflow_state' });
    expect(setting).toBeNull();
    const log = await AuditLog.findOne({ action: 'constraint_window_locked' });
    expect(log).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 3: Exception flow — THE KEY SCENARIO
// ────────────────────────────────────────────────────────────────────────────

describe('Constraint exception flow', () => {
  it('3.1 — global lock blocks Employee 2 from submitting for locked week', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);
    const { token: emp2Token } = await seedEmployee('2');
    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${emp2Token}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: true }] });
    expect(res.status).toBe(403);
  });

  it('3.2 — employee creates unlock request for locked week', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { token } = await seedEmployee('1');
    const res = await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK });
    expect(res.status).toBe(201);
    expect(res.body.exception.status).toBe('pending');
    expect(res.body.exception.weekId).toBe(TEST_WEEK);
  });

  it('3.3 — duplicate unlock request is rejected with 409', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { token } = await seedEmployee('1');
    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK });
    const res = await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK });
    expect(res.status).toBe(409);
  });

  it('3.4 — manager approves exception: status approved, AuditLog constraint_exception_granted', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee, token: empToken } = await seedEmployee('1');
    const { token: managerToken } = await seedManager();

    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ weekId: TEST_WEEK });

    const created = await ConstraintException.findOne({ employeeId: employee._id });

    const res = await request(app)
      .patch(`/api/v1/constraint-exceptions/${created!._id}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.exception.status).toBe('approved');

    const log = await AuditLog.findOne({ action: 'constraint_exception_granted' });
    expect(log).not.toBeNull();
  });

  it('3.5 — approved employee submits for locked week: allowed, exception consumed, audit logged', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee, token: empToken } = await seedEmployee('1');
    const { manager, token: managerToken } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ weekId: TEST_WEEK });

    const exc = await ConstraintException.findOne({ employeeId: employee._id });

    await request(app)
      .patch(`/api/v1/constraint-exceptions/${exc!._id}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'approve' });

    const submitRes = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: true }] });

    expect(submitRes.status).toBe(200);

    const updatedException = await ConstraintException.findById(exc!._id);
    expect(updatedException!.status).toBe('consumed');
    expect(updatedException!.consumedAt).not.toBeNull();

    const consumedLog = await AuditLog.findOne({ action: 'constraint_exception_consumed' });
    expect(consumedLog).not.toBeNull();
  });

  it('3.6 — exception is single-use: second submission after consumption returns 403', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee, token: empToken } = await seedEmployee('1');
    const { manager, token: managerToken } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);

    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ weekId: TEST_WEEK });
    const exc = await ConstraintException.findOne({ employeeId: employee._id });
    await request(app)
      .patch(`/api/v1/constraint-exceptions/${exc!._id}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'approve' });

    // First submission consumes exception
    await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: true }] });

    // Second submission should be blocked
    const secondRes = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: false }] });
    expect(secondRes.status).toBe(403);
  });

  it('3.7 — Employee 2 is still blocked while Employee 1 has an approved exception', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);
    const { token: emp2Token } = await seedEmployee('2');

    const res = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${emp2Token}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: true }] });
    expect(res.status).toBe(403);
  });

  it('3.8 — Employee 2 can submit for Week 2 (next week) while W16 is locked', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { manager } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);
    const { token: emp2Token } = await seedEmployee('2');

    const res = await request(app)
      .put(`/api/v1/constraints/${NEXT_WEEK}`)
      .set('Authorization', `Bearer ${emp2Token}`)
      .send({ entries: [{ date: '2026-04-21', definitionId: String(def._id), canWork: true }] });
    expect(res.status).toBe(200);
  });

  it('3.9 — manager denies exception: status denied, AuditLog constraint_exception_denied', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee, token: empToken } = await seedEmployee('1');
    const { manager } = await seedManager();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);
    const { token: managerToken } = { token: makeToken(manager) };

    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ weekId: TEST_WEEK });
    const exc = await ConstraintException.findOne({ employeeId: employee._id });

    const res = await request(app)
      .patch(`/api/v1/constraint-exceptions/${exc!._id}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'deny', managerNote: 'Too late' });
    expect(res.status).toBe(200);
    expect(res.body.exception.status).toBe('denied');

    const log = await AuditLog.findOne({ action: 'constraint_exception_denied' });
    expect(log).not.toBeNull();

    // Denied employee cannot submit
    const submitRes = await request(app)
      .put(`/api/v1/constraints/${TEST_WEEK}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ entries: [{ date: '2026-04-14', definitionId: String(def._id), canWork: true }] });
    expect(submitRes.status).toBe(403);
  });

  it('3.10 — only managers can review exceptions', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AFTER_DEADLINE);
    const { employee, token: empToken } = await seedEmployee('1');
    const { token: emp2Token } = await seedEmployee('2');

    await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ weekId: TEST_WEEK });
    const exc = await ConstraintException.findOne({ employeeId: employee._id });

    const res = await request(app)
      .patch(`/api/v1/constraint-exceptions/${exc!._id}/review`)
      .set('Authorization', `Bearer ${emp2Token}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(403);
  });

  it('3.11 — cannot request exception for an open (before deadline) week', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_DEADLINE);
    const { token } = await seedEmployee('1');
    const res = await request(app)
      .post('/api/v1/constraint-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: TEST_WEEK });
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 4: assignment_override audit log
// ────────────────────────────────────────────────────────────────────────────

describe('assignment_override audit log', () => {
  async function seedAssignmentFixture(assignedBy: 'algorithm' | 'manager') {
    const { manager } = await seedManager();
    const { employee } = await seedEmployee();
    const def = await seedShiftDef(manager._id as mongoose.Types.ObjectId);
    const schedule = await WeeklySchedule.create({
      weekId: '2026-W24',
      startDate: new Date('2026-06-07'),
      endDate: new Date('2026-06-13'),
      status: 'published',
      generatedBy: 'auto',
    });
    const shift = await Shift.create({
      scheduleId: schedule._id,
      definitionId: def._id,
      date: new Date('2026-06-07'),
      requiredCount: 2,
      status: 'empty',
    });
    const assignment = await Assignment.create({
      shiftId: shift._id,
      userId: employee._id,
      scheduleId: schedule._id,
      assignedBy,
      status: 'pending',
    });
    return {
      manager,
      employee,
      assignment,
      managerToken: makeToken(manager),
      employeeToken: makeToken(employee),
    };
  }

  it('4.1 — manager PATCHes algorithm-assigned → AuditLog has assignment_override', async () => {
    const { assignment, managerToken } = await seedAssignmentFixture('algorithm');
    await request(app)
      .patch(`/api/v1/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assignedBy: 'manager' });
    const log = await AuditLog.findOne({ action: 'assignment_override' });
    expect(log).not.toBeNull();
  });

  it('4.2 — manager PATCHes manager-assigned → no assignment_override entry', async () => {
    const { assignment, managerToken } = await seedAssignmentFixture('manager');
    await request(app)
      .patch(`/api/v1/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'confirmed' });
    const log = await AuditLog.findOne({ action: 'assignment_override' });
    expect(log).toBeNull();
  });

  it('4.3 — manager overrides algorithm-assigned → exactly 2 audit logs for that assignment', async () => {
    const { assignment, managerToken } = await seedAssignmentFixture('algorithm');
    await request(app)
      .patch(`/api/v1/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assignedBy: 'manager' });
    const logs = await AuditLog.find({ refId: assignment._id });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('assignment_updated');
    expect(actions).toContain('assignment_override');
    expect(logs).toHaveLength(2);
  });

  it('4.4 — employee confirms own assignment → zero assignment_override logs', async () => {
    const { assignment, employeeToken } = await seedAssignmentFixture('algorithm');
    await request(app)
      .patch(`/api/v1/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'confirmed' });
    const log = await AuditLog.findOne({ action: 'assignment_override' });
    expect(log).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 5: schedule_regenerated audit log
// ────────────────────────────────────────────────────────────────────────────

describe('schedule_regenerated audit log and draft re-generation', () => {
  it('5.1 — draft exists; manager POSTs same weekId → 201 and AuditLog schedule_regenerated', async () => {
    const { manager, token } = await seedManager();
    await seedDefaultShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'draft',
      generatedBy: 'manual',
    });
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: '2026-W20', generatedBy: 'auto' });
    expect(res.status).toBe(201);
    const log = await AuditLog.findOne({ action: 'schedule_regenerated' });
    expect(log).not.toBeNull();
  });

  it('5.2 — published schedule; manager POSTs same weekId → 409 (behavior unchanged)', async () => {
    const { token } = await seedManager();
    await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'published',
      generatedBy: 'auto',
    });
    const res = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: '2026-W20', generatedBy: 'auto' });
    expect(res.status).toBe(409);
  });

  it('5.3 — regeneration cascades: old shift and assignment are gone from DB', async () => {
    const { manager, token } = await seedManager();
    const { morning: def } = await seedDefaultShiftDefinitions(
      manager._id as mongoose.Types.ObjectId
    );
    const { employee } = await seedEmployee();

    const oldSchedule = await WeeklySchedule.create({
      weekId: '2026-W20',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-16'),
      status: 'draft',
      generatedBy: 'manual',
    });
    const oldShift = await Shift.create({
      scheduleId: oldSchedule._id,
      definitionId: def._id,
      date: new Date('2026-05-10'),
      requiredCount: 1,
      status: 'empty',
    });
    const oldAssignment = await Assignment.create({
      shiftId: oldShift._id,
      userId: employee._id,
      scheduleId: oldSchedule._id,
      assignedBy: 'algorithm',
      status: 'pending',
    });

    await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ weekId: '2026-W20', generatedBy: 'auto' });

    expect(await Shift.findById(oldShift._id)).toBeNull();
    expect(await Assignment.findById(oldAssignment._id)).toBeNull();
  });
});
