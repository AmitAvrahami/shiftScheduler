import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import User from '../models/User';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

const managerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z
    .string()
    .trim()
    .email('כתובת אימייל לא תקינה')
    .transform((email) => email.toLowerCase())
    .optional(),
  role: z.enum(['employee', 'manager', 'admin']).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
});

const selfUpdateSchema = z.object({
  phone: z.string().optional(),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
});

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getUserById - start', { id: req.params.id });
  try {
    const { id } = req.params;
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';

    if (!isManagerOrAdmin && id !== req.user!._id) {
      return next(new AppError('Forbidden', 403));
    }

    const user = await User.findById(id);
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
    logger.info('getUserById - end', { id: req.params.id });
  } catch (err) {
    logger.error('getUserById - error', err);
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('updateUser - start', { id: req.params.id, body: req.body });
  try {
    const { id } = req.params;
    const isAdmin = req.user!.role === 'admin';
    const isManagerOrAdmin = req.user!.role === 'manager' || isAdmin;
    const isSelf = id === req.user!._id;

    if (!isManagerOrAdmin && !isSelf) {
      return next(new AppError('Forbidden', 403));
    }

    const parsed = isManagerOrAdmin
      ? managerUpdateSchema.safeParse(req.body)
      : selfUpdateSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const requestedRole = 'role' in parsed.data ? parsed.data.role : undefined;
    if (isManagerOrAdmin && requestedRole === 'admin' && !isAdmin) {
      return next(new AppError('Forbidden', 403));
    }

    if (isManagerOrAdmin && !isSelf) {
      const target = await User.findById(id);
      if (!target) return next(new AppError('משתמש לא נמצא', 404));
      if (!isAdmin && target.role !== 'employee') {
        return next(new AppError('Forbidden', 403));
      }
    }

    const updateData: Record<string, unknown> = parsed.data;
    const newEmail = typeof updateData.email === 'string' ? updateData.email : null;
    if (newEmail) {
      const existing = await User.findOne({
        email: newEmail,
        _id: { $ne: id },
      });
      if (existing) {
        return next(new AppError('כתובת האימייל כבר בשימוש', 409));
      }
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
    logger.info('updateUser - end', { id: req.params.id });
  } catch (err) {
    logger.error('updateUser - error', err);
    next(err);
  }
}

export async function softDeleteUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('softDeleteUser - start', { id: req.params.id });
  try {
    const { id } = req.params;

    if (id === req.user!._id) {
      return next(new AppError('Cannot delete your own account', 422));
    }

    const user = await User.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
    logger.info('softDeleteUser - end', { id: req.params.id });
  } catch (err) {
    logger.error('softDeleteUser - error', err);
    next(err);
  }
}
