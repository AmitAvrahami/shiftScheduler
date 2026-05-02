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
  ip: string
): Promise<{ created: number }> {
  const schedule = await WeeklySchedule.findOne({ weekId }).lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);

  if (!['open', 'locked'].includes(schedule.status)) {
    throw new AppError(`Cannot generate shifts for a ${schedule.status} schedule`, 422);
  }

  const definitions = await ShiftDefinition.find({ isActive: true })
    .sort({ orderNumber: 1 })
    .lean();
  if (definitions.length === 0) throw new AppError('No active shift definitions found', 422);

  const scheduleId = schedule._id as mongoose.Types.ObjectId;
  const existingCount = await Shift.countDocuments({ scheduleId });
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

  await Shift.insertMany(shiftDocs);

  await AuditLog.create({
    performedBy: actorId,
    action: 'shifts_generated',
    refModel: 'WeeklySchedule',
    refId: scheduleId,
    after: { weekId, shiftCount: shiftDocs.length },
    ip,
  });

  return { created: shiftDocs.length };
}
