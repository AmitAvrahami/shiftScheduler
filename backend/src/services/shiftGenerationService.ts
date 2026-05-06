import mongoose from 'mongoose';
import { startOfWeek, addDays, set } from 'date-fns';
import WeeklySchedule, { IWeeklySchedule } from '../models/WeeklySchedule';
import ShiftDefinition from '../models/ShiftDefinition';
import Shift from '../models/Shift';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { getWeekDates } from '../utils/weekUtils';

function normalizeWeekStart(startOfWeekDate: Date): Date {
  return startOfWeek(startOfWeekDate, { weekStartsOn: 0 });
}

function buildDateTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
}

function getShiftDateForDay(startOfWeek: Date, dayOfWeek: number): Date {
  return addDays(startOfWeek, dayOfWeek);
}

function getShiftDateTimes(
  date: Date,
  startTime: string,
  endTime: string,
  crossesMidnight: boolean
): { startsAt: Date; endsAt: Date } {
  const startsAt = buildDateTime(date, startTime);
  let endsAt = buildDateTime(date, endTime);

  if (crossesMidnight || endsAt <= startsAt) {
    endsAt = addDays(endsAt, 1);
  }

  return { startsAt, endsAt };
}

export async function generateWeekFromBlueprints(
  organizationId: mongoose.Types.ObjectId | string,
  startOfWeekDate: Date,
  session?: mongoose.ClientSession
): Promise<{ created: number }> {
  void organizationId;

  const startOfWeek = normalizeWeekStart(startOfWeekDate);
  const endOfWeek = addDays(startOfWeek, 7);

  const schedule = await WeeklySchedule.findOne({ startDate: startOfWeek })
    .session(session || null)
    .lean();
  if (!schedule) throw new AppError('Schedule not found for blueprint generation week', 404);

  const existingCount = await Shift.countDocuments({
    date: { $gte: startOfWeek, $lt: endOfWeek },
  }).session(session || null);
  if (existingCount > 0) throw new AppError('Shifts already exist for this date range', 409);

  const definitions = await ShiftDefinition.find({ isActive: true })
    .session(session || null)
    .sort({ orderNumber: 1 })
    .lean();
  if (definitions.length === 0) {
    throw new AppError('No active shift definitions found', 422, 'ERR_NO_SHIFT_TEMPLATES');
  }

  const scheduleId = schedule._id as mongoose.Types.ObjectId;
  const shiftDocs = definitions.flatMap((def) =>
    def.daysOfWeek.map((dayOfWeek) => {
      const date = getShiftDateForDay(startOfWeek, dayOfWeek);
      const { startsAt, endsAt } = getShiftDateTimes(
        date,
        def.startTime,
        def.endTime,
        def.crossesMidnight
      );

      return {
        scheduleId,
        definitionId: def._id,
        date,
        startTime: def.startTime,
        endTime: def.endTime,
        startsAt,
        endsAt,
        requiredCount: def.requiredStaffCount,
        status: 'empty' as const,
        templateStatus: 'matching_template' as const,
      };
    })
  );

  if (shiftDocs.length > 0) {
    await Shift.insertMany(shiftDocs, { session });
  }

  return { created: shiftDocs.length };
}

export async function generateWeekShifts(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string,
  session?: mongoose.ClientSession
): Promise<{ created: number }> {
  const schedule = await WeeklySchedule.findOne({ weekId })
    .session(session || null)
    .lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);

  if (!['open', 'locked', 'draft'].includes(schedule.status)) {
    throw new AppError(`Cannot generate shifts for a ${schedule.status} schedule`, 422);
  }

  const scheduleId = schedule._id as mongoose.Types.ObjectId;
  const existingCount = await Shift.countDocuments({ scheduleId }).session(session || null);
  if (existingCount > 0) throw new AppError('Shifts already exist for this schedule', 409);

  const dates = getWeekDates(weekId);
  const { created } = await generateWeekFromBlueprints('default', dates[0], session);

  await AuditLog.create(
    [
      {
        performedBy: actorId,
        action: 'shifts_generated',
        refModel: 'WeeklySchedule',
        refId: scheduleId,
        after: { weekId, shiftCount: created },
        ip,
      },
    ],
    { session }
  );

  return { created };
}

export async function fillMissingTemplateShifts(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string,
  session?: mongoose.ClientSession
): Promise<{ created: number; skipped: number }> {
  const schedule = await WeeklySchedule.findOne({ weekId })
    .session(session || null)
    .lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);

  if (!['open', 'locked', 'draft'].includes(schedule.status)) {
    throw new AppError(`Cannot materialize shifts for a ${schedule.status} schedule`, 422);
  }

  const definitions = await ShiftDefinition.find({ isActive: true })
    .session(session || null)
    .sort({ orderNumber: 1 })
    .lean();
  if (definitions.length === 0) {
    throw new AppError(
      'Cannot materialize schedule without active shift templates',
      422,
      'ERR_NO_SHIFT_TEMPLATES'
    );
  }

  const scheduleId = schedule._id as mongoose.Types.ObjectId;
  const dates = getWeekDates(weekId);
  const expectedShiftDocs = definitions.flatMap((def) =>
    def.daysOfWeek.map((dayOfWeek) => {
      const date = getShiftDateForDay(dates[0], dayOfWeek);
      const { startsAt, endsAt } = getShiftDateTimes(
        date,
        def.startTime,
        def.endTime,
        def.crossesMidnight
      );

      return {
        scheduleId,
        definitionId: def._id,
        date,
        startTime: def.startTime,
        endTime: def.endTime,
        startsAt,
        endsAt,
        requiredCount: def.requiredStaffCount,
        status: 'empty' as const,
        templateStatus: 'matching_template' as const,
      };
    })
  );

  const existingShifts = await Shift.find({ scheduleId }, 'definitionId date')
    .session(session || null)
    .lean();
  const existingKeys = new Set(
    existingShifts.map((shift) => `${String(shift.definitionId)}:${shift.date.toISOString()}`)
  );
  const missingShiftDocs = expectedShiftDocs.filter(
    (shift) => !existingKeys.has(`${String(shift.definitionId)}:${shift.date.toISOString()}`)
  );
  const skipped = expectedShiftDocs.length - missingShiftDocs.length;

  if (missingShiftDocs.length > 0) {
    await Shift.insertMany(missingShiftDocs, { session });
  }

  await AuditLog.create(
    [
      {
        performedBy: actorId,
        action: 'shifts_filled_from_template',
        refModel: 'WeeklySchedule',
        refId: scheduleId,
        after: { weekId, created: missingShiftDocs.length, skipped },
        ip,
      },
    ],
    { session }
  );

  return { created: missingShiftDocs.length, skipped };
}

/**
 * Atomic initialization of a weekly schedule.
 * Creates the schedule document and generates initial shifts in a single transaction.
 */
export async function initializeWeeklySchedule(
  weekId: string,
  generatedBy: 'auto' | 'manual',
  actorId: mongoose.Types.ObjectId,
  ip: string
): Promise<{ schedule: IWeeklySchedule; shiftCount: number }> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await WeeklySchedule.findOne({ weekId }).session(session).lean();
    if (existing) {
      throw new AppError(`Schedule for week ${weekId} already exists`, 409);
    }

    const dates = getWeekDates(weekId);
    const [schedule] = await WeeklySchedule.create(
      [
        {
          weekId,
          startDate: dates[0],
          endDate: dates[6],
          status: 'draft',
          generatedBy,
        },
      ],
      { session }
    );

    await AuditLog.create(
      [
        {
          performedBy: actorId,
          action: 'schedule_created',
          refModel: 'WeeklySchedule',
          refId: schedule._id,
          after: { weekId, generatedBy, status: 'draft' },
          ip,
        },
      ],
      { session }
    );

    const { created: shiftCount } = await fillMissingTemplateShifts(weekId, actorId, ip, session);

    await session.commitTransaction();
    return { schedule, shiftCount };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
