import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import User from '../models/User';
import AppError from '../utils/AppError';

const managerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
});

const selfUpdateSchema = z.object({
  phone: z.string().optional(),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
});

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';

    if (!isManagerOrAdmin && id !== req.user!._id) {
      return next(new AppError('Forbidden', 403));
    }

    const user = await User.findById(id);
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const isSelf = id === req.user!._id;

    if (!isManagerOrAdmin && !isSelf) {
      return next(new AppError('Forbidden', 403));
    }

    const schema = isManagerOrAdmin ? managerUpdateSchema : selfUpdateSchema;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const user = await User.findByIdAndUpdate(id, { $set: parsed.data }, { new: true, runValidators: true });
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

export async function softDeleteUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (id === req.user!._id) {
      return next(new AppError('Cannot delete your own account', 422));
    }

    const user = await User.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}
