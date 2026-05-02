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
import { generateWeekShifts } from '../services/shiftGenerationService';
import { logger } from '../utils/logger';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;

const createSchema = z.object({
  weekId: z.string().regex(WEEK_ID_RE, 'Invalid weekId format — expected YYYY-WNN'),
  generatedBy: z.enum(['auto', 'manual']),
});

const updateSchema = z.object({
  status: z.enum(['open', 'locked', 'generating', 'draft', 'published', 'archived']).optional(),
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
  logger.info('getSchedules - start');
  try {
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const filter = isManagerOrAdmin ? {} : { status: 'published' };
    const schedules = await WeeklySchedule.find(filter).sort({ startDate: -1 });
    res.json({ success: true, schedules });
    logger.info('getSchedules - end', { count: schedules.length });
  } catch (err) {
    logger.error('getSchedules - error', err);
    next(err);
  }
}

export async function createSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('createSchedule - start', { body: req.body });
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const { weekId, generatedBy } = parsed.data;
    if (!validateWeekId(weekId, next)) return;

    const existing = await WeeklySchedule.findOne({ weekId });
    if (existing) {
      const { role } = req.user!;
      if (existing.status === 'draft' && !['admin', 'manager'].includes(role)) {
        return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
      }

      if (!['open', 'draft'].includes(existing.status)) {
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
      status: 'open',
      generatedBy,
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'schedule_created',
      refModel: 'WeeklySchedule',
      refId: schedule._id,
      after: { weekId, generatedBy, status: 'open' },
      ip: req.ip,
    });

    res.status(201).json({ success: true, schedule });
    logger.info('createSchedule - end', { weekId: schedule.weekId });
  } catch (err) {
    logger.error('createSchedule - error', err);
    next(err);
  }
}

export async function getScheduleById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getScheduleById - start', { id: req.params.id });
  try {
    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const { role } = req.user!;

    // BOLA check: Only admins and managers can see drafts
    if (schedule.status === 'draft' && !['admin', 'manager'].includes(role)) {
      return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
    }

    const isManagerOrAdmin = role === 'manager' || role === 'admin';
    if (!isManagerOrAdmin && schedule.status !== 'published') {
      return next(new AppError('Schedule not found', 404));
    }

    res.json({ success: true, schedule });
    logger.info('getScheduleById - end', { id: req.params.id });
  } catch (err) {
    logger.error('getScheduleById - error', err);
    next(err);
  }
}

export async function updateSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('updateSchedule - start', { id: req.params.id, body: req.body });
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const { role } = req.user!;
    if (schedule.status === 'draft' && !['admin', 'manager'].includes(role)) {
      return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
    }

    const before = schedule.toObject();

    if (parsed.data.status) {
      const { status: newStatus } = parsed.data;
      const { status: currentStatus } = schedule;

      const validTransitions: Record<string, string[]> = {
        open:       ['locked'],
        locked:     ['open'],       // 'generating' is auto-only (via generateSchedule)
        generating: [],             // all exits are auto — PATCH always returns 422
        draft:      ['published', 'open'],
        published:  ['archived'],
        archived:   [],
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
    logger.info('updateSchedule - end', { id: req.params.id });
  } catch (err) {
    logger.error('updateSchedule - error', err);
    next(err);
  }
}

export async function deleteSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('deleteSchedule - start', { id: req.params.id });
  try {
    const schedule = await WeeklySchedule.findById(req.params.id);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const { role } = req.user!;
    if (schedule.status === 'draft' && !['admin', 'manager'].includes(role)) {
      return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
    }

    if (!['open', 'draft'].includes(schedule.status)) {
      return next(new AppError('Only open or draft schedules can be deleted', 422));
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
    logger.info('deleteSchedule - end', { id: req.params.id });
  } catch (err) {
    logger.error('deleteSchedule - error', err);
    next(err);
  }
}

const cloneSchema = z.object({
  targetWeekId: z.string().regex(WEEK_ID_RE, 'Invalid targetWeekId format — expected YYYY-WNN'),
});

export async function cloneSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('cloneSchedule - start', { id: req.params.id, body: req.body });
  try {
    const parsed = cloneSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const { targetWeekId } = parsed.data;
    if (!validateWeekId(targetWeekId, next)) return;

    const source = await WeeklySchedule.findById(req.params.id);
    if (!source) return next(new AppError('Schedule not found', 404));

    const { role } = req.user!;
    if (source.status === 'draft' && !['admin', 'manager'].includes(role)) {
      return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
    }

    const existingTarget = await WeeklySchedule.findOne({ weekId: targetWeekId });
    if (existingTarget && !['open', 'draft'].includes(existingTarget.status)) {
      return next(new AppError(`A ${existingTarget.status} schedule already exists for week ${targetWeekId}`, 409));
    }
    if (existingTarget && ['open', 'draft'].includes(existingTarget.status)) {
      await cascadeDeleteSchedule(existingTarget._id as mongoose.Types.ObjectId);
    }

    const sourceDates = getWeekDates(source.weekId);
    const targetDates = getWeekDates(targetWeekId);
    const offsetMs = targetDates[0].getTime() - sourceDates[0].getTime();

    const targetSchedule = await WeeklySchedule.create({
      weekId: targetWeekId,
      startDate: targetDates[0],
      endDate: targetDates[6],
      status: 'draft',
      generatedBy: 'manual',
    });

    const sourceShifts = await Shift.find({ scheduleId: source._id }).lean();
    const shiftIdMap = new Map<string, mongoose.Types.ObjectId>();

    for (const shift of sourceShifts) {
      const newDate = new Date(new Date(shift.date).getTime() + offsetMs);
      const newShift = await Shift.create({
        scheduleId: targetSchedule._id,
        definitionId: shift.definitionId,
        date: newDate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        requiredCount: shift.requiredCount,
        status: shift.status,
      });
      shiftIdMap.set(String(shift._id), newShift._id as mongoose.Types.ObjectId);
    }

    const sourceAssignments = await Assignment.find({ scheduleId: source._id }).lean();
    if (sourceAssignments.length > 0) {
      await Assignment.insertMany(
        sourceAssignments.map((a) => ({
          shiftId: shiftIdMap.get(String(a.shiftId)),
          scheduleId: targetSchedule._id,
          userId: a.userId,
          assignedBy: req.user!._id,
          status: a.status,
        }))
      );
    }

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'schedule_cloned',
      refModel: 'WeeklySchedule',
      refId: targetSchedule._id,
      after: { sourceWeekId: source.weekId, targetWeekId },
      ip: req.ip,
    });

    res.status(201).json({ success: true, schedule: targetSchedule });
    logger.info('cloneSchedule - end', { id: req.params.id });
  } catch (err) {
    logger.error('cloneSchedule - error', err);
    next(err);
  }
}

export async function generateSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('generateSchedule - start', { weekId: req.params.weekId });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const actorId = new mongoose.Types.ObjectId(req.user!._id as string);
    const ip = req.ip ?? 'unknown';

    // Ensure a schedule exists before invoking the solver
    let schedule = await WeeklySchedule.findOne({ weekId });
    if (!schedule) {
      const dates = getWeekDates(weekId);
      schedule = await WeeklySchedule.create({
        weekId,
        startDate: dates[0],
        endDate: dates[6],
        status: 'open',
        generatedBy: 'auto',
      });
      await AuditLog.create({
        performedBy: actorId,
        action: 'schedule_created',
        refModel: 'WeeklySchedule',
        refId: schedule._id,
        after: { weekId, generatedBy: 'auto', status: 'open' },
        ip,
      });
    } else {
      const { role } = req.user!;
      if (schedule.status === 'draft' && !['admin', 'manager'].includes(role)) {
        return next(new AppError('Forbidden — draft access restricted to admins and managers', 403));
      }

      if (!['open', 'locked', 'draft'].includes(schedule.status)) {
        return next(new AppError(`Cannot re-generate a ${schedule.status} schedule`, 422));
      }
    }

    const existingShiftCount = await Shift.countDocuments({ scheduleId: schedule._id });
    if (existingShiftCount === 0) {
      await generateWeekShifts(weekId, actorId, ip);
    }

    // Transition to 'generating' before invoking the solver
    await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'generating' } });

    let result: Awaited<ReturnType<typeof runScheduler>>;
    try {
      result = await runScheduler(weekId, actorId, ip);
      await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'draft' } });
    } catch (solverErr) {
      await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'locked' } });
      throw solverErr;
    }

    res.json({ success: true, ...result });
    logger.info('generateSchedule - end', { weekId: req.params.weekId });
  } catch (err) {
    logger.error('generateSchedule - error', err);
    next(err);
  }
}
