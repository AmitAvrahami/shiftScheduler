import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import WeeklySchedule from '../models/WeeklySchedule';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  scheduleId: z.string().min(1),
  definitionId: z.string().min(1),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD'),
  requiredCount: z.number().int().positive(),
  status: z.enum(['filled', 'partial', 'empty']).optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  definitionId: z.string().min(1).optional(),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD').optional(),
  requiredCount: z.number().int().positive().optional(),
  status: z.enum(['filled', 'partial', 'empty']).optional(),
  notes: z.string().optional(),
});

export async function getShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { scheduleId } = req.query;
    if (!scheduleId || typeof scheduleId !== 'string') {
      return next(new AppError('scheduleId query parameter is required', 400));
    }

    const schedule = await WeeklySchedule.findById(scheduleId);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule.status === 'draft') {
      return next(new AppError('Schedule not found', 404));
    }

    const shifts = await Shift.find({ scheduleId }).sort({ date: 1 });
    res.json({ success: true, shifts });
  } catch (err) {
    next(err);
  }
}

export async function createShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const schedule = await WeeklySchedule.findById(parsed.data.scheduleId);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const shift = await Shift.create({
      ...parsed.data,
      date: new Date(parsed.data.date),
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'shift_created',
      refModel: 'Shift',
      refId: shift._id,
      after: parsed.data,
      ip: req.ip,
    });

    res.status(201).json({ success: true, shift });
  } catch (err) {
    next(err);
  }
}

export async function getShiftById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return next(new AppError('Shift not found', 404));

    const schedule = await WeeklySchedule.findById(shift.scheduleId);
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule?.status === 'draft') {
      return next(new AppError('Shift not found', 404));
    }

    res.json({ success: true, shift });
  } catch (err) {
    next(err);
  }
}

export async function updateShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const before = await Shift.findById(req.params.id);
    if (!before) return next(new AppError('Shift not found', 404));

    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.date) update.date = new Date(parsed.data.date);

    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'shift_updated',
      refModel: 'Shift',
      refId: shift!._id,
      before: before.toObject(),
      after: parsed.data,
      ip: req.ip,
    });

    res.json({ success: true, shift });
  } catch (err) {
    next(err);
  }
}

export async function deleteShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return next(new AppError('Shift not found', 404));

    await Assignment.deleteMany({ shiftId: shift._id });
    await Shift.findByIdAndDelete(shift._id);

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'shift_deleted',
      refModel: 'Shift',
      refId: shift._id,
      before: shift.toObject(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Shift deleted' });
  } catch (err) {
    next(err);
  }
}
