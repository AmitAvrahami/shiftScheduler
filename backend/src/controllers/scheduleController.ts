import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import SystemSettings from '../models/SystemSettings';
import User from '../models/User';
import AppError from '../utils/AppError';
import { parseWeekId, getWeekDates } from '../utils/weekUtils';
import { runScheduler } from '../services/schedulerService';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;

const createSchema = z.object({
  weekId: z.string().regex(WEEK_ID_RE, 'Invalid weekId format — expected YYYY-WNN'),
  generatedBy: z.enum(['auto', 'manual']),
});

const updateSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  generatedBy: z.enum(['auto', 'manual']).optional(),
});

async function cascadeDeleteSchedule(scheduleId: mongoose.Types.ObjectId): Promise<void> {
  const shiftIds = await Shift.find({ scheduleId }, '_id').lean();
  await Assignment.deleteMany({ shiftId: { $in: shiftIds.map((s) => s._id) } });
  await Shift.deleteMany({ scheduleId });
  await WeeklySchedule.findByIdAndDelete(scheduleId);
}

function validateWeekId(weekId: string, next: NextFunction): boolean {
  try {
    parseWeekId(weekId);
    return true;
  } catch {
    next(new AppError('Invalid weekId format — expected YYYY-WNN', 400));
    return false;
  }
}

export async function getSchedules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const filter = isManagerOrAdmin ? {} : { status: 'published' };
    const schedules = await WeeklySchedule.find(filter).sort({ startDate: -1 });
    res.json({ success: true, schedules });
  } catch (err) {
    next(err);
  }
}

export async function createSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const { weekId, generatedBy } = parsed.data;
    if (!validateWeekId(weekId, next)) return;

    const existing = await WeeklySchedule.findOne({ weekId });
    if (existing) {
      if (existing.status !== 'draft') {
        return next(new AppError(`Schedule for week ${weekId} already exists`, 409));
      }
      const before = existing.toObject();
      await cascadeDeleteSchedule(existing._id as mongoose.Types.ObjectId);
      await AuditLog.create({
        performedBy: req.user!._id,
        action: 'schedule_regenerated',
        refModel: 'WeeklySchedule',
        refId: existing._id,
        before,
        ip: req.ip,
      });
    }

    const dates = getWeekDates(weekId);
    const schedule = await WeeklySchedule.create({
      weekId,
      startDate: dates[0],
      endDate: dates[6],
      status: 'draft',
      generatedBy,
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'schedule_created',
      refModel: 'WeeklySchedule',
      refId: schedule._id,
      after: { weekId, generatedBy, status: 'draft' },
      ip: req.ip,
    });

    res.status(201).json({ success: true, schedule });
  } catch (err) {
    next(err);
  }
}

export async function getScheduleById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule.status === 'draft') {
      return next(new AppError('Schedule not found', 404));
    }

    res.json({ success: true, schedule });
  } catch (err) {
    next(err);
  }
}

export async function updateSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const before = schedule.toObject();

    if (parsed.data.status) {
      const { status: newStatus } = parsed.data;
      const { status: currentStatus } = schedule;

      const validTransitions: Record<string, string[]> = {
        draft: ['published'],
        published: ['archived'],
        archived: [],
      };

      if (!validTransitions[currentStatus].includes(newStatus)) {
        return next(
          new AppError(`Cannot transition schedule from '${currentStatus}' to '${newStatus}'`, 422)
        );
      }

      if (newStatus === 'published') {
        schedule.publishedAt = new Date();
        schedule.publishedBy = req.user!._id as unknown as typeof schedule.publishedBy;

        const activeUsers = await User.find({ isActive: true, role: 'employee' }, '_id').lean();
        if (activeUsers.length > 0) {
          await Notification.insertMany(
            activeUsers.map((u) => ({
              userId: u._id,
              type: 'schedule_published',
              title: 'לוח משמרות פורסם',
              body: `לוח המשמרות לשבוע ${schedule.weekId} פורסם`,
              refModel: 'WeeklySchedule',
              refId: schedule._id,
            }))
          );
        }

        await SystemSettings.findOneAndUpdate(
          { key: 'workflow_state' },
          { $set: { value: 'schedule_published', updatedAt: new Date() } },
          { upsert: true }
        );
      }

      schedule.status = newStatus;
    }

    if (parsed.data.generatedBy) {
      schedule.generatedBy = parsed.data.generatedBy;
    }

    await schedule.save();

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'schedule_updated',
      refModel: 'WeeklySchedule',
      refId: schedule._id,
      before,
      after: parsed.data,
      ip: req.ip,
    });

    res.json({ success: true, schedule });
  } catch (err) {
    next(err);
  }
}

export async function deleteSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    if (schedule.status !== 'draft') {
      return next(new AppError('Only draft schedules can be deleted', 422));
    }

    await cascadeDeleteSchedule(schedule._id as mongoose.Types.ObjectId);

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'schedule_deleted',
      refModel: 'WeeklySchedule',
      refId: schedule._id,
      before: schedule.toObject(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    next(err);
  }
}

export async function generateSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const actorId = new mongoose.Types.ObjectId(req.user!._id as string);
    const ip = req.ip ?? 'unknown';

    // Ensure a draft schedule exists before invoking the solver
    const existing = await WeeklySchedule.findOne({ weekId });
    if (!existing) {
      const dates = getWeekDates(weekId);
      const created = await WeeklySchedule.create({
        weekId,
        startDate: dates[0],
        endDate: dates[6],
        status: 'draft',
        generatedBy: 'auto',
      });
      await AuditLog.create({
        performedBy: actorId,
        action: 'schedule_created',
        refModel: 'WeeklySchedule',
        refId: created._id,
        after: { weekId, generatedBy: 'auto', status: 'draft' },
        ip,
      });
    } else if (existing.status !== 'draft') {
      return next(new AppError(`Cannot re-generate a ${existing.status} schedule`, 422));
    }

    const result = await runScheduler(weekId, actorId, ip);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
