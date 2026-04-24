import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import ShiftDefinition from '../models/ShiftDefinition';
import AppError from '../utils/AppError';

const TIME_RE = /^\d{2}:\d{2}$/;
const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const createSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(TIME_RE, 'startTime must be HH:MM'),
  endTime: z.string().regex(TIME_RE, 'endTime must be HH:MM'),
  durationMinutes: z.number().int().positive(),
  crossesMidnight: z.boolean(),
  color: z.string().regex(HEX_RE, 'color must be a valid hex color'),
  orderNumber: z.number().int().nonnegative(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export async function getActiveShiftDefinitions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isManager = req.user!.role === 'manager' || req.user!.role === 'admin';
    const filter = isManager ? {} : { isActive: true };
    const definitions = await ShiftDefinition.find(filter).sort({ orderNumber: 1 });
    res.json({ success: true, definitions });
  } catch (err) {
    next(err);
  }
}

export async function getShiftDefinitionById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const definition = await ShiftDefinition.findById(req.params.id);
    if (!definition) return next(new AppError('Shift definition not found', 404));
    res.json({ success: true, definition });
  } catch (err) {
    next(err);
  }
}

export async function createShiftDefinition(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const definition = await ShiftDefinition.create({
      ...parsed.data,
      createdBy: req.user!._id,
    });

    res.status(201).json({ success: true, definition });
  } catch (err) {
    next(err);
  }
}

export async function updateShiftDefinition(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const definition = await ShiftDefinition.findByIdAndUpdate(
      req.params.id,
      { $set: parsed.data },
      { new: true, runValidators: true }
    );
    if (!definition) return next(new AppError('Shift definition not found', 404));

    res.json({ success: true, definition });
  } catch (err) {
    next(err);
  }
}

export async function deactivateShiftDefinition(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const definition = await ShiftDefinition.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );
    if (!definition) return next(new AppError('Shift definition not found', 404));

    res.json({ success: true, definition });
  } catch (err) {
    next(err);
  }
}
