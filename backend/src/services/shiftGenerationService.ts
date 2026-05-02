import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import ShiftDefinition from '../models/ShiftDefinition';
import Shift from '../models/Shift';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { getWeekDates } from '../utils/weekUtils';

export async function generateWeekShifts(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string,
  session?: mongoose.ClientSession
): Promise<{ created: number }> {
  const schedule = await WeeklySchedule.findOne({ weekId }).session(session || null).lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);

  if (!['open', 'locked', 'draft'].includes(schedule.status)) {
    throw new AppError(`Cannot generate shifts for a ${schedule.status} schedule`, 422);
  }

  const definitions = await ShiftDefinition.find({ isActive: true })
    .session(session || null)
    .sort({ orderNumber: 1 })
    .lean();
  if (definitions.length === 0) {
    throw new AppError('No active shift definitions found', 422, 'ERR_NO_SHIFT_TEMPLATES');
  }

  const scheduleId = schedule._id as mongoose.Types.ObjectId;
  const existingCount = await Shift.countDocuments({ scheduleId }).session(session || null);
  if (existingCount > 0) throw new AppError('Shifts already exist for this schedule', 409);

  // getWeekDates returns local-midnight Dates: [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  const dates = getWeekDates(weekId);
  const shiftDocs = [];
  for (const date of dates) {
    const day = date.getDay(); // local day — do NOT use getUTCDay()
    const isWeekend = day === 0 || day === 6;
    for (const def of definitions) {
      shiftDocs.push({
        scheduleId,
        definitionId: def._id,
        date,
        requiredCount: def.coverageRequirements[isWeekend ? 'weekend' : 'weekday'],
        status: 'empty' as const,
      });
    }
  }

  await Shift.insertMany(shiftDocs, { session });

  await AuditLog.create(
    [
      {
        performedBy: actorId,
        action: 'shifts_generated',
        refModel: 'WeeklySchedule',
        refId: scheduleId,
        after: { weekId, shiftCount: shiftDocs.length },
        ip,
      },
    ],
    { session }
  );

  return { created: shiftDocs.length };
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
): Promise<{ schedule: any; shiftCount: number }> {
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

    const { created: shiftCount } = await generateWeekShifts(weekId, actorId, ip, session);

    await session.commitTransaction();
    return { schedule, shiftCount };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
