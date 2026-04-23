import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User';
import AppError from '../utils/AppError';

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

function signToken(payload: { _id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '24h') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, secret, { expiresIn });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  } catch (err) {
    next(err);
  }
}

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await User.find({}).sort({ name: 1 });
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
}

export async function updateUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
  } catch (err) {
    next(err);
  }
}

export async function updateFixedMorning(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
  } catch (err) {
    next(err);
  }
}
