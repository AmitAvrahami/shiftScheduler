import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

// Manager-only: create a new user account
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['employee', 'manager', 'admin']).optional(),
  isFixedMorningEmployee: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

const updateFixedMorningSchema = z.object({
  isFixedMorningEmployee: z.boolean(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

function signToken(payload: { _id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '24h') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, secret, { expiresIn });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('register - start', { email: req.body.email, role: req.body.role });
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const { name, email, password, role, isFixedMorningEmployee } = parsed.data;

    const existing = await User.findOne({ email });
    if (existing) {
      return next(new AppError('כתובת האימייל כבר בשימוש', 409));
    }

    const user = await User.create({ name, email, password, role, isFixedMorningEmployee });

    res.status(201).json({ success: true, user });
    logger.info('register - end', { userId: user._id });
  } catch (err) {
    logger.error('register - error', err);
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('login - start', { email: req.body.email });
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const { email, password } = parsed.data;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('פרטי ההתחברות שגויים', 401));
    }

    if (!user.isActive) {
      return next(new AppError('החשבון מושהה. פנה למנהל.', 403));
    }

    const token = signToken({ _id: String(user._id), email: user.email, role: user.role });

    res.status(200).json({ success: true, token, user });
    logger.info('login - end', { userId: user._id });
  } catch (err) {
    logger.error('login - error', err);
    next(err);
  }
}

export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getUsers - start');
  try {
    const users = await User.find({}).sort({ name: 1 });
    res.json({ success: true, users });
    logger.info('getUsers - end', { count: users.length });
  } catch (err) {
    logger.error('getUsers - error', err);
    next(err);
  }
}

export async function updateUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('updateUserStatus - start', { id: req.params.id, isActive: req.body.isActive });
  try {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: parsed.data.isActive },
      { new: true, runValidators: true }
    );
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
    logger.info('updateUserStatus - end', { id: req.params.id });
  } catch (err) {
    logger.error('updateUserStatus - error', err);
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('resetPassword - start', { id: req.params.id });
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    // Must use findById + save() to trigger the pre-save bcrypt hook.
    // findByIdAndUpdate() bypasses it and would store a plaintext password.
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    user.password = parsed.data.password;
    await user.save(); // triggers pre-save hash

    res.json({ success: true, user }); // password excluded by toJSON transform
    logger.info('resetPassword - end', { id: req.params.id });
  } catch (err) {
    logger.error('resetPassword - error', err);
    next(err);
  }
}

export async function updateFixedMorning(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('updateFixedMorning - start', { id: req.params.id, isFixedMorningEmployee: req.body.isFixedMorningEmployee });
  try {
    const parsed = updateFixedMorningSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFixedMorningEmployee: parsed.data.isFixedMorningEmployee },
      { new: true, runValidators: true }
    );
    if (!user) return next(new AppError('משתמש לא נמצא', 404));

    res.json({ success: true, user });
    logger.info('updateFixedMorning - end', { id: req.params.id });
  } catch (err) {
    logger.error('updateFixedMorning - error', err);
    next(err);
  }
}
