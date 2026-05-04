import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Shift from '../models/Shift';
import ShiftDefinition from '../models/ShiftDefinition';
import type { IShiftDefinition } from '../models/ShiftDefinition';
import Assignment from '../models/Assignment';
import WeeklySchedule from '../models/WeeklySchedule';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const objectId = (field: string) =>
  z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), `${field} must be a valid ObjectId`);

function buildDateTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

function getShiftDateTimes(
  date: Date,
  startTime: string,
  endTime: string,
  crossesMidnight = false
): { startsAt: Date; endsAt: Date } {
  const startsAt = buildDateTime(date, startTime);
  const sameDayEndsAt = buildDateTime(date, endTime);
  const endsAt = crossesMidnight || sameDayEndsAt <= startsAt
    ? new Date(sameDayEndsAt.getTime() + DAY_MS)
    : sameDayEndsAt;

  return { startsAt, endsAt };
}

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
  requiredStaffCount: z.number().int().positive().optional(),
  startTime: z.string().regex(TIME_RE, 'startTime must be HH:MM').optional(),
  endTime: z.string().regex(TIME_RE, 'endTime must be HH:MM').optional(),
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
  if (data.requiredCount && data.requiredStaffCount && data.requiredCount !== data.requiredStaffCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredStaffCount'],
      message: 'requiredStaffCount must match requiredCount when both are provided',
    });
  }
}).transform(({ shiftDefinitionId, requiredStaffCount, ...data }) => ({
  ...data,
  ...(data.requiredCount || requiredStaffCount
    ? { requiredCount: data.requiredCount ?? requiredStaffCount }
    : {}),
  ...(data.definitionId || shiftDefinitionId
    ? { definitionId: data.definitionId ?? shiftDefinitionId }
    : {}),
}));

type ShiftResponse = Record<string, unknown> & {
  templateStatus: 'matching_template' | 'manually_modified';
};

function isTemplateStatus(value: unknown): value is ShiftResponse['templateStatus'] {
  return value === 'matching_template' || value === 'manually_modified';
}

function isModifiedFromDefinition(
  shift: Record<string, unknown>,
  definition: Pick<IShiftDefinition, 'startTime' | 'endTime' | 'requiredStaffCount'> | undefined
): boolean {
  if (!definition) return true;
  return shift.startTime !== definition.startTime
    || shift.endTime !== definition.endTime
    || shift.requiredCount !== definition.requiredStaffCount;
}

async function attachTemplateStatusToShift(shift: unknown): Promise<ShiftResponse> {
  const shiftObject = typeof (shift as { toObject?: () => unknown }).toObject === 'function'
    ? (shift as { toObject: () => Record<string, unknown> }).toObject()
    : { ...(shift as Record<string, unknown>) };
  const definitionId = shiftObject.definitionId;
  if (isTemplateStatus(shiftObject.templateStatus)) {
    return {
      ...shiftObject,
      templateStatus: shiftObject.templateStatus,
    };
  }

  const definition = definitionId
    ? await ShiftDefinition.findById(definitionId).lean()
    : null;

  return {
    ...shiftObject,
    templateStatus: isModifiedFromDefinition(shiftObject, definition ?? undefined)
      ? 'manually_modified'
      : 'matching_template',
  };
}

async function attachTemplateStatusToShifts(shifts: unknown[]): Promise<ShiftResponse[]> {
  const shiftObjects = shifts.map((shift) => (
    typeof (shift as { toObject?: () => unknown }).toObject === 'function'
      ? (shift as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(shift as Record<string, unknown>) }
  ));
  const definitionIds = [...new Set(shiftObjects.map((shift) => String(shift.definitionId)).filter(Boolean))];
  const definitions = await ShiftDefinition.find({ _id: { $in: definitionIds } }).lean();
  const definitionById = new Map(definitions.map((definition) => [String(definition._id), definition]));

  return shiftObjects.map((shift) => {
    if (isTemplateStatus(shift.templateStatus)) {
      return {
        ...shift,
        templateStatus: shift.templateStatus,
      };
    }

    return {
      ...shift,
      templateStatus: isModifiedFromDefinition(shift, definitionById.get(String(shift.definitionId)))
        ? 'manually_modified'
        : 'matching_template',
    };
  });
}

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

    const shifts = await Shift.find({ scheduleId }).sort({ date: 1 }).lean({ defaults: false });
    res.json({ success: true, shifts: await attachTemplateStatusToShifts(shifts) });
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

    const definition = await ShiftDefinition.findById(parsed.data.definitionId).lean();
    if (!definition) return next(new AppError('Shift definition not found', 404));

    const shift = await Shift.create({
      ...parsed.data,
      date: new Date(parsed.data.date),
      startTime: definition.startTime,
      endTime: definition.endTime,
      ...getShiftDateTimes(new Date(parsed.data.date), definition.startTime, definition.endTime, definition.crossesMidnight),
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'shift_created',
      refModel: 'Shift',
      refId: shift._id,
      after: parsed.data,
      ip: req.ip,
    });

    res.status(201).json({ success: true, shift: await attachTemplateStatusToShift(shift) });
    logger.info('createShift - end', { id: shift._id });
  } catch (err) {
    logger.error('createShift - error', err);
    next(err);
  }
}

export async function getShiftById(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getShiftById - start', { id: req.params.id });
  try {
    const shift = await Shift.findById(req.params.id).lean({ defaults: false });
    if (!shift) return next(new AppError('Shift not found', 404));

    const schedule = await WeeklySchedule.findById(shift.scheduleId);
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && schedule?.status !== 'published') {
      return next(new AppError('Shift not found', 404));
    }

    res.json({ success: true, shift: await attachTemplateStatusToShift(shift) });
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
    let crossesMidnight = before.endsAt.getTime() > buildDateTime(before.date, before.endTime).getTime();
    if (parsed.data.date) update.date = new Date(parsed.data.date);
    if (parsed.data.definitionId) {
      const definition = await ShiftDefinition.findById(parsed.data.definitionId).lean();
      if (!definition) return next(new AppError('Shift definition not found', 404));
      update.startTime = parsed.data.startTime ?? definition.startTime;
      update.endTime = parsed.data.endTime ?? definition.endTime;
      crossesMidnight = definition.crossesMidnight;
    }
    if (parsed.data.startTime && !parsed.data.definitionId) update.startTime = parsed.data.startTime;
    if (parsed.data.endTime && !parsed.data.definitionId) update.endTime = parsed.data.endTime;
    if (parsed.data.date || parsed.data.definitionId || parsed.data.startTime || parsed.data.endTime) {
      const date = (update.date as Date | undefined) ?? before.date;
      const startTime = (update.startTime as string | undefined) ?? before.startTime;
      const endTime = (update.endTime as string | undefined) ?? before.endTime;
      Object.assign(update, getShiftDateTimes(date, startTime, endTime, crossesMidnight));
    }
    if (parsed.data.startTime || parsed.data.endTime || parsed.data.requiredCount) {
      update.templateStatus = 'manually_modified';
    }

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

    res.json({ success: true, shift: await attachTemplateStatusToShift(shift) });
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
