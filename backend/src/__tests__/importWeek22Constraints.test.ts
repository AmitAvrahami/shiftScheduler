import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Constraint from '../models/Constraint';
import ShiftDefinition from '../models/ShiftDefinition';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import {
  importWeek22Constraints,
  type Week22ImageConstraint,
} from '../scripts/importWeek22Constraints';
import { toDateKey } from '../utils/weekUtils';

let mongoServer: MongoMemoryServer;

const WEEK_ID = '2026-W22';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

async function seedManager() {
  return User.create({
    name: 'Meital',
    email: 'meital@example.com',
    password: 'managerpass1',
    role: 'manager',
  });
}

async function seedEmployee(name: string) {
  return User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'employee1',
    role: 'employee',
  });
}

async function seedShiftDefinitions(createdBy: mongoose.Types.ObjectId) {
  const [morning, afternoon, night] = await ShiftDefinition.insertMany([
    {
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy,
      requiredStaffCount: 2,
    },
    {
      name: 'אחהצ',
      startTime: '14:45',
      endTime: '22:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFA500',
      isActive: true,
      orderNumber: 2,
      createdBy,
      requiredStaffCount: 2,
    },
    {
      name: 'לילה',
      startTime: '22:45',
      endTime: '06:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: true,
      color: '#000080',
      isActive: true,
      orderNumber: 3,
      createdBy,
      requiredStaffCount: 1,
    },
  ]);

  return { morning, afternoon, night };
}

function row(
  employeeKey: string,
  employeeName: string,
  aliases: string[],
  date: string,
  day: string,
  shift: Week22ImageConstraint['shift']
): Week22ImageConstraint {
  return {
    employeeKey,
    employeeName,
    aliases,
    date,
    day,
    shift,
    canWork: false,
    availabilityType: 'unavailable',
  };
}

describe('importWeek22Constraints', () => {
  it('creates unavailable manager-override entries and skips missing employees', async () => {
    const manager = await seedManager();
    await seedEmployee('Bar');
    await seedShiftDefinitions(manager._id as mongoose.Types.ObjectId);
    await WeeklySchedule.create({
      weekId: WEEK_ID,
      startDate: new Date(2026, 4, 24),
      endDate: new Date(2026, 4, 30),
      status: 'locked',
      generatedBy: 'manual',
    });

    const result = await importWeek22Constraints({
      apply: true,
      managerEmail: 'meital@example.com',
      constraints: [
        row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-24', 'Sunday', 'morning'),
        row('missing', 'Missing', ['Missing'], '2026-05-24', 'Sunday', 'night'),
      ],
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        employeeName: 'Bar / בר',
        date: '2026-05-24',
        day: 'Sunday',
        shift: 'morning',
        action: 'created',
        applied: true,
      }),
      expect.objectContaining({
        employeeName: 'Missing',
        action: 'skipped',
        reason: 'employee_not_found',
        applied: false,
      }),
    ]);

    const constraint = await Constraint.findOne({ weekId: WEEK_ID }).lean();
    expect(constraint).not.toBeNull();
    expect(constraint!.submittedVia).toBe('manager_override');
    expect(String(constraint!.overriddenBy)).toBe(String(manager._id));
    expect(constraint!.entries).toHaveLength(1);
    expect(toDateKey(constraint!.entries[0].date)).toBe('2026-05-24');
    expect(constraint!.entries[0]).toMatchObject({
      canWork: false,
      availabilityType: 'unavailable',
    });
  });

  it('updates existing matching entries, preserves unrelated entries, and is idempotent', async () => {
    const manager = await seedManager();
    const bar = await seedEmployee('Bar');
    const { morning, night } = await seedShiftDefinitions(manager._id as mongoose.Types.ObjectId);

    await Constraint.create({
      userId: bar._id,
      weekId: WEEK_ID,
      submittedVia: 'self',
      entries: [
        {
          date: new Date(2026, 4, 24),
          definitionId: morning._id,
          canWork: true,
          availabilityType: 'available',
          startTime: '07:00',
          endTime: '12:00',
        },
        {
          date: new Date(2026, 4, 25),
          definitionId: night._id,
          canWork: true,
          availabilityType: 'available',
        },
      ],
    });

    const constraints = [row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-24', 'Sunday', 'morning')];

    const first = await importWeek22Constraints({
      apply: true,
      managerEmail: 'meital@example.com',
      constraints,
    });
    const second = await importWeek22Constraints({
      apply: true,
      managerEmail: 'meital@example.com',
      constraints,
    });

    expect(first.results[0]).toMatchObject({ action: 'updated', applied: true });
    expect(second.results[0]).toMatchObject({ action: 'skipped', reason: 'already_unavailable' });

    const constraint = await Constraint.findOne({ userId: bar._id, weekId: WEEK_ID }).lean();
    expect(constraint!.entries).toHaveLength(2);

    const imported = constraint!.entries.find(
      (entry) =>
        toDateKey(entry.date) === '2026-05-24' && String(entry.definitionId) === String(morning._id)
    );
    expect(imported).toMatchObject({
      canWork: false,
      availabilityType: 'unavailable',
    });
    expect(imported!.startTime).toBeUndefined();
    expect(imported!.endTime).toBeUndefined();

    const unrelated = constraint!.entries.find(
      (entry) =>
        toDateKey(entry.date) === '2026-05-25' && String(entry.definitionId) === String(night._id)
    );
    expect(unrelated).toMatchObject({
      canWork: true,
      availabilityType: 'available',
    });
  });
});
