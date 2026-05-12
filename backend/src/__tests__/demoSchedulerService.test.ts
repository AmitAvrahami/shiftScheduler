import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import { runDemoScheduler } from '../services/demoSchedulerService';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

const WEEK_ID = '2026-W20';
const ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');

async function seedSchedule() {
  return WeeklySchedule.create({
    weekId: WEEK_ID,
    startDate: new Date(2026, 4, 10),
    endDate: new Date(2026, 4, 16),
    status: 'generating',
    generatedBy: 'auto',
  });
}

async function seedDefinition(name: string, orderNumber: number) {
  return ShiftDefinition.create({
    name,
    startTime: orderNumber === 1 ? '06:45' : '14:45',
    endTime: orderNumber === 1 ? '14:45' : '22:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#056AE5',
    isActive: true,
    orderNumber,
    requiredStaffCount: 1,
    createdBy: ACTOR_ID,
  });
}

async function seedWorker(idSuffix: string, name: string) {
  return User.create({
    _id: new mongoose.Types.ObjectId(`000000000000000000000${idSuffix}`),
    name,
    email: `${name.toLowerCase()}@test.com`,
    password: 'password123',
    role: 'employee',
    isActive: true,
    isFixedMorningEmployee: false,
  });
}

async function seedShift(
  scheduleId: mongoose.Types.ObjectId,
  definitionId: mongoose.Types.ObjectId,
  date: Date,
  requiredCount: number
) {
  return Shift.create({
    scheduleId,
    definitionId,
    date,
    requiredCount,
    status: 'empty',
  });
}

describe('runDemoScheduler', () => {
  it('preserves manager assignments, replaces stale algorithm assignments, and avoids same-day double booking', async () => {
    const schedule = await seedSchedule();
    const morning = await seedDefinition('Morning', 1);
    const evening = await seedDefinition('Evening', 2);
    const alice = await seedWorker('101', 'Alice');
    const bob = await seedWorker('102', 'Bob');

    const firstShift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      morning._id as mongoose.Types.ObjectId,
      new Date(2026, 4, 10),
      2
    );
    const secondShift = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      evening._id as mongoose.Types.ObjectId,
      new Date(2026, 4, 10),
      2
    );

    const managerAssignment = await Assignment.create({
      shiftId: firstShift._id,
      userId: alice._id,
      scheduleId: schedule._id,
      assignedBy: 'manager',
      status: 'confirmed',
    });
    await Assignment.create({
      shiftId: secondShift._id,
      userId: alice._id,
      scheduleId: schedule._id,
      assignedBy: 'algorithm',
      status: 'pending',
    });

    const result = await runDemoScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.status).toBe('OPTIMAL');
    expect(result.assignmentCount).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining(`shift ${secondShift._id.toString()}: reduced required from 2 to 0`),
    ]);

    expect(await Assignment.findById(managerAssignment._id)).not.toBeNull();
    expect(
      await Assignment.countDocuments({ scheduleId: schedule._id, assignedBy: 'algorithm' })
    ).toBe(1);

    const algorithmAssignment = await Assignment.findOne({
      scheduleId: schedule._id,
      assignedBy: 'algorithm',
    }).lean();
    expect(algorithmAssignment!.shiftId.toString()).toBe(firstShift._id.toString());
    expect(algorithmAssignment!.userId.toString()).toBe(bob._id.toString());

    const updatedFirst = await Shift.findById(firstShift._id).lean();
    const updatedSecond = await Shift.findById(secondShift._id).lean();
    expect(updatedFirst!.status).toBe('filled');
    expect(updatedSecond!.status).toBe('empty');

    const audit = await AuditLog.findOne({ action: 'schedule_generated' }).lean();
    expect(audit).not.toBeNull();
    expect(audit!.after).toMatchObject({
      weekId: WEEK_ID,
      mode: 'demo',
      assignmentCount: 1,
    });
  });

  it('prefers the worker with the lowest assigned shift count across sorted shifts', async () => {
    const schedule = await seedSchedule();
    const morning = await seedDefinition('Morning', 1);
    const alice = await seedWorker('201', 'Alice');
    const bob = await seedWorker('202', 'Bob');

    const sunday = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      morning._id as mongoose.Types.ObjectId,
      new Date(2026, 4, 10),
      1
    );
    const monday = await seedShift(
      schedule._id as mongoose.Types.ObjectId,
      morning._id as mongoose.Types.ObjectId,
      new Date(2026, 4, 11),
      1
    );

    const result = await runDemoScheduler(WEEK_ID, ACTOR_ID, '127.0.0.1');

    expect(result.assignmentCount).toBe(2);
    const assignments = await Assignment.find({ scheduleId: schedule._id, assignedBy: 'algorithm' })
      .sort({ shiftId: 1 })
      .lean();
    const byShift = new Map(assignments.map((a) => [a.shiftId.toString(), a.userId.toString()]));

    expect(byShift.get(sunday._id.toString())).toBe(alice._id.toString());
    expect(byShift.get(monday._id.toString())).toBe(bob._id.toString());
  });
});
