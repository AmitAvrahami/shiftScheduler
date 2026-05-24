import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Constraint from '../models/Constraint';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import Schedule from '../models/WeeklySchedule';
import { cleanupPublishedSchedules } from '../scripts/cleanupPublishedSchedules';

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
  jest.restoreAllMocks();
});

function scheduleInput(weekId: string, status: 'draft' | 'published' | 'archived') {
  return {
    weekId,
    startDate: new Date('2026-05-10'),
    endDate: new Date('2026-05-16'),
    status,
    generatedBy: 'manual' as const,
  };
}

describe('cleanupPublishedSchedules', () => {
  it('deletes only published schedules, logs counts, and verifies none remain', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'manager@test.com',
      password: 'Password123!',
      role: 'manager',
    });

    await ShiftDefinition.create({
      name: 'Morning',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy: manager._id,
      requiredStaffCount: 1,
    });

    await Constraint.create({
      userId: manager._id,
      weekId: '2026-W20',
      entries: [],
    });

    await Schedule.create(scheduleInput('2026-W20', 'published'));
    await Schedule.create(scheduleInput('2026-W21', 'published'));
    await Schedule.create(scheduleInput('2026-W22', 'draft'));
    await Schedule.create(scheduleInput('2026-W23', 'archived'));

    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await cleanupPublishedSchedules();

    expect(result).toEqual({ found: 2, deleted: 2, remaining: 0 });
    expect(log).toHaveBeenCalledWith('Found 2 published schedules');
    expect(log).toHaveBeenCalledWith('Deleted 2 published schedules');
    expect(await Schedule.countDocuments({ status: 'published' })).toBe(0);
    expect(await Schedule.countDocuments({ status: 'draft' })).toBe(1);
    expect(await Schedule.countDocuments({ status: 'archived' })).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(await Constraint.countDocuments()).toBe(1);
    expect(await ShiftDefinition.countDocuments()).toBe(1);
  });
});
