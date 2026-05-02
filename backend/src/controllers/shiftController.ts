import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Shift from '../models/Shift';
import Assignment from '../models/Assignment';
import WeeklySchedule from '../models/WeeklySchedule';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const objectId = (field: string) =>
  z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), `${field} must be a valid ObjectId`);

const createSchema = z.object({
  scheduleId: objectId('scheduleId'),
  definitionId: objectId('definitionId').optional(),
  shiftDefinitionId: objectId('shiftDefinitionId').optional(),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD'),
  requiredCount: z.number().int().positive(),
  status: z.enum(['filled', 'partial', 'empty']).optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.definitionId && !data.shiftDefinitionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['definitionId'],
      message: 'definitionId or shiftDefinitionId is required',
    });
  }

  if (data.definitionId && data.shiftDefinitionId && data.definitionId !== data.shiftDefinitionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shiftDefinitionId'],
      message: 'shiftDefinitionId must match definitionId when both are provided',
    });
  }
}).transform(({ shiftDefinitionId, ...data }) => ({
  ...data,
  definitionId: data.definitionId ?? shiftDefinitionId!,
}));

const updateSchema = z.object({
  definitionId: objectId('definitionId').optional(),
  shiftDefinitionId: objectId('shiftDefinitionId').optional(),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD').optional(),
  requiredCount: z.number().int().positive().optional(),
  status: z.enum(['filled', 'partial', 'empty']).optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.definitionId && data.shiftDefinitionId && data.definitionId !== data.shiftDefinitionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shiftDefinitionId'],
      message: 'shiftDefinitionId must match definitionId when both are provided',
    });
  }
}).transform(({ shiftDefinitionId, ...data }) => ({
  ...data,
  ...(data.definitionId || shiftDefinitionId
    ? { definitionId: data.definitionId ?? shiftDefinitionId }
    : {}),
}));

function logShiftValidationError(action: 'create' | 'update', error: z.ZodError, body: unknown): void {
  console.error(`[shiftController] Failed to ${action} shift: validation error`, {
    issues: error.errors.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
    body,
  });
}

export async function getShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getShifts - start', { scheduleId: req.query.scheduleId });
  try {
    const { scheduleId } = req.query;
    if (!scheduleId || typeof scheduleId !== 'string') {
      return next(new AppError('scheduleId query parameter is required', 400));
    }

    const schedule = await WeeklySchedule.findById(scheduleId);
    if (!schedule) return next(new AppError('Schedule not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule.status !== 'published') {
      return next(new AppError('Schedule not found', 404));
    }

    const shifts = await Shift.find({ scheduleId }).sort({ date: 1 });
    res.json({ success: true, shifts });
    logger.info('getShifts - end', { count: shifts.length });
  } catch (err) {
    logger.error('getShifts - error', err);
    next(err);
  }
}

export async function createShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('createShift - start', { body: req.body });
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      logShiftValidationError('create', parsed.error, req.body);
      return next(new AppError(parsed.error.errors[0].message, 400, 'ERR_SHIFT_VALIDATION'));
    }

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
    logger.info('createShift - end', { id: shift._id });
  } catch (err) {
    logger.error('createShift - error', err);
    next(err);
  }
}

export async function getShiftById(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getShiftById - start', { id: req.params.id });
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return next(new AppError('Shift not found', 404));

    const schedule = await WeeklySchedule.findById(shift.scheduleId);
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule?.status !== 'published') {
      return next(new AppError('Shift not found', 404));
    }

    res.json({ success: true, shift });
    logger.info('getShiftById - end', { id: req.params.id });
  } catch (err) {
    logger.error('getShiftById - error', err);
    next(err);
  }
}

export async function updateShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('updateShift - start', { id: req.params.id, body: req.body });
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      logShiftValidationError('update', parsed.error, req.body);
      return next(new AppError(parsed.error.errors[0].message, 400, 'ERR_SHIFT_VALIDATION'));
    }

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
    logger.info('updateShift - end', { id: req.params.id });
  } catch (err) {
    logger.error('updateShift - error', err);
    next(err);
  }
}

export async function deleteShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('deleteShift - start', { id: req.params.id });
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
    logger.info('deleteShift - end', { id: req.params.id });
  } catch (err) {
    logger.error('deleteShift - error', err);
    next(err);
  }
}
