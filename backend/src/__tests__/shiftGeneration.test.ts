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
import AuditLog from '../models/AuditLog';
import { fillMissingTemplateShifts, generateWeekFromBlueprints } from '../services/shiftGenerationService';

// Sun 2026-05-10 through Sat 2026-05-16
const TEST_WEEK = '2026-W20';

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

async function seedAdmin() {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'Password123!',
    role: 'admin',
  });
  return { admin, token: makeToken(admin) };
}

async function seedSchedule(status = 'open') {
  return WeeklySchedule.create({
    weekId: TEST_WEEK,
    startDate: new Date(2026, 4, 10),
    endDate: new Date(2026, 4, 16),
    status,
    generatedBy: 'manual',
  });
}

async function seedDefinitions(createdBy: mongoose.Types.ObjectId) {
  return ShiftDefinition.insertMany([
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
}

describe('POST /api/v1/admin/weeks/:weekId/shifts', () => {
  it('generates exactly 21 shifts (7 days × 3 definitions)', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(21);
    expect(await Shift.countDocuments()).toBe(21);
  });

  it('returns 409 on second call — idempotency guard', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(await Shift.countDocuments()).toBe(21); // unchanged
  });

  it('assigns requiredCount from requiredStaffCount', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    const morningDef = await ShiftDefinition.findOne({ name: 'בוקר' }).lean();
    expect(morningDef).not.toBeNull();

    const morningShifts = await Shift.find({
      definitionId: morningDef!._id,
    }).lean();
    expect(morningShifts.length).toBe(7);
    morningShifts.forEach((s) => expect(s.requiredCount).toBe(2));
  });

  it('generates shifts only on configured daysOfWeek', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await ShiftDefinition.create({
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [1, 3],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy: admin._id,
      requiredStaffCount: 2,
    });

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);

    const shifts = await Shift.find().sort({ date: 1 }).lean();
    expect(shifts.map((shift) => shift.date.getDay())).toEqual([1, 3]);
    shifts.forEach((shift) => {
      expect(shift.startTime).toBe('06:45');
      expect(shift.endTime).toBe('14:45');
      expect(shift.startsAt).toBeInstanceOf(Date);
      expect(shift.endsAt).toBeInstanceOf(Date);
    });
  });

  it('night shift date equals the calendar day it starts — not the next day', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    const nightDef = await ShiftDefinition.findOne({ name: 'לילה' }).lean();
    expect(nightDef!.crossesMidnight).toBe(true);

    // Monday night shift must have date = Mon May 11, not Tue May 12
    const mondayNight = await Shift.findOne({
      definitionId: nightDef!._id,
      date: new Date(2026, 4, 11),
    }).lean();
    expect(mondayNight).not.toBeNull();
    expect(mondayNight!.startsAt).toEqual(new Date(2026, 4, 11, 22, 45));
    expect(mondayNight!.endsAt).toEqual(new Date(2026, 4, 12, 6, 45));

    // Exactly 7 night shifts total — one per day, not 14
    const nightCount = await Shift.countDocuments({ definitionId: nightDef!._id });
    expect(nightCount).toBe(7);
  });

  it('returns 404 when no schedule exists for the given weekId', async () => {
    const { token } = await seedAdmin();

    const res = await request(app)
      .post('/api/v1/admin/weeks/2099-W01/shifts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 422 when schedule status is published', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('published');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(await Shift.countDocuments()).toBe(0);
  });

  it('returns 422 when no active ShiftDefinitions exist', async () => {
    const { token } = await seedAdmin();
    await seedSchedule('open');

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(await Shift.countDocuments()).toBe(0);
  });

  it('creates an audit log entry on success', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    const log = await AuditLog.findOne({ action: 'shifts_generated' }).lean();
    expect(log).not.toBeNull();
    expect((log!.after as Record<string, unknown>).weekId).toBe(TEST_WEEK);
    expect((log!.after as Record<string, unknown>).shiftCount).toBe(21);
  });

  it('returns 400 for a malformed weekId in the URL', async () => {
    const { token } = await seedAdmin();

    const res = await request(app)
      .post('/api/v1/admin/weeks/not-a-week/shifts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('succeeds when schedule status is locked', async () => {
    const { admin, token } = await seedAdmin();
    await seedSchedule('locked');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(21);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`);

    expect(res.status).toBe(401);
  });

  it('returns 403 for a manager token', async () => {
    const manager = await User.create({
      name: 'Manager',
      email: 'mgr@test.com',
      password: 'Password123!',
      role: 'manager',
    });
    const token = makeToken(manager);

    const res = await request(app)
      .post(`/api/v1/admin/weeks/${TEST_WEEK}/shifts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('generateWeekFromBlueprints', () => {
  it('creates shifts from active blueprints and ignores inactive definitions', async () => {
    const { admin } = await seedAdmin();
    await seedSchedule('open');
    await ShiftDefinition.create({
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [1],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy: admin._id,
      requiredStaffCount: 2,
    });
    await ShiftDefinition.create({
      name: 'כבוי',
      startTime: '10:00',
      endTime: '12:00',
      daysOfWeek: [2],
      durationMinutes: 120,
      crossesMidnight: false,
      color: '#333333',
      isActive: false,
      orderNumber: 2,
      createdBy: admin._id,
      requiredStaffCount: 1,
    });

    const result = await generateWeekFromBlueprints(new mongoose.Types.ObjectId(), new Date(2026, 4, 10, 15));

    expect(result.created).toBe(1);
    const shift = await Shift.findOne().lean();
    expect(shift).not.toBeNull();
    expect(shift!.date).toEqual(new Date(2026, 4, 11));
    expect(shift!.requiredCount).toBe(2);
    expect(shift!.startTime).toBe('06:45');
    expect(shift!.endTime).toBe('14:45');
    expect(shift!.startsAt).toEqual(new Date(2026, 4, 11, 6, 45));
    expect(shift!.endsAt).toEqual(new Date(2026, 4, 11, 14, 45));
  });

  it('calculates overnight endsAt on the following calendar day', async () => {
    const { admin } = await seedAdmin();
    await seedSchedule('open');
    await ShiftDefinition.create({
      name: 'לילה',
      startTime: '22:00',
      endTime: '06:00',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: true,
      color: '#000080',
      isActive: true,
      orderNumber: 1,
      createdBy: admin._id,
      requiredStaffCount: 1,
    });

    await generateWeekFromBlueprints('ignored-org', new Date(2026, 4, 10));

    const shift = await Shift.findOne().lean();
    expect(shift!.startsAt).toEqual(new Date(2026, 4, 10, 22, 0));
    expect(shift!.endsAt).toEqual(new Date(2026, 4, 11, 6, 0));
  });

  it('throws 409 when shifts already exist in the generated date range', async () => {
    const { admin } = await seedAdmin();
    const schedule = await seedSchedule('open');
    const def = await ShiftDefinition.create({
      name: 'בוקר',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy: admin._id,
      requiredStaffCount: 2,
    });
    await Shift.create({
      scheduleId: schedule._id,
      definitionId: def._id,
      date: new Date(2026, 4, 10),
      requiredCount: 2,
      status: 'empty',
    });

    await expect(generateWeekFromBlueprints('ignored-org', new Date(2026, 4, 10))).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('fillMissingTemplateShifts', () => {
  it('is idempotent when all template shifts already exist', async () => {
    const { admin } = await seedAdmin();
    await seedSchedule('open');
    await seedDefinitions(admin._id as mongoose.Types.ObjectId);

    const first = await fillMissingTemplateShifts(
      TEST_WEEK,
      admin._id as mongoose.Types.ObjectId,
      '127.0.0.1'
    );
    const second = await fillMissingTemplateShifts(
      TEST_WEEK,
      admin._id as mongoose.Types.ObjectId,
      '127.0.0.1'
    );

    expect(first).toEqual({ created: 21, skipped: 0 });
    expect(second).toEqual({ created: 0, skipped: 21 });
    expect(await Shift.countDocuments()).toBe(21);
  });

  it('fills only missing template shifts for a partial schedule', async () => {
    const { admin } = await seedAdmin();
    const schedule = await seedSchedule('open');
    const [morningDef] = await seedDefinitions(admin._id as mongoose.Types.ObjectId);
    await Shift.create({
      scheduleId: schedule._id,
      definitionId: morningDef._id,
      date: new Date(2026, 4, 10),
      startTime: morningDef.startTime,
      endTime: morningDef.endTime,
      startsAt: new Date(2026, 4, 10, 6, 45),
      endsAt: new Date(2026, 4, 10, 14, 45),
      requiredCount: morningDef.requiredStaffCount,
      status: 'empty',
    });

    const result = await fillMissingTemplateShifts(
      TEST_WEEK,
      admin._id as mongoose.Types.ObjectId,
      '127.0.0.1'
    );

    expect(result).toEqual({ created: 20, skipped: 1 });
    expect(await Shift.countDocuments()).toBe(21);
  });

  it('calculates overnight endsAt on the following calendar day', async () => {
    const { admin } = await seedAdmin();
    await seedSchedule('open');
    await ShiftDefinition.create({
      name: 'לילה',
      startTime: '22:00',
      endTime: '06:00',
      daysOfWeek: [0],
      durationMinutes: 480,
      crossesMidnight: true,
      color: '#000080',
      isActive: true,
      orderNumber: 1,
      createdBy: admin._id,
      requiredStaffCount: 1,
    });

    await fillMissingTemplateShifts(TEST_WEEK, admin._id as mongoose.Types.ObjectId, '127.0.0.1');

    const shift = await Shift.findOne().lean();
    expect(shift!.startsAt).toEqual(new Date(2026, 4, 10, 22, 0));
    expect(shift!.endsAt).toEqual(new Date(2026, 4, 11, 6, 0));
    expect(shift!.templateStatus).toBe('matching_template');
  });

  it('throws 422 when no active ShiftDefinitions exist', async () => {
    const { admin } = await seedAdmin();
    await seedSchedule('open');

    await expect(
      fillMissingTemplateShifts(TEST_WEEK, admin._id as mongoose.Types.ObjectId, '127.0.0.1')
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'ERR_NO_SHIFT_TEMPLATES',
      message: 'Cannot materialize schedule without active shift templates',
    });
  });
});
