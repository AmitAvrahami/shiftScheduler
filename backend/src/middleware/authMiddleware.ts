import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError';

interface JwtPayload {
  _id: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
}

export function verifyToken(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new AppError('Unauthorized', 401));
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = { _id: decoded._id, email: decoded.email, role: decoded.role };
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}

export function isManager(req: Request, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role === 'manager' || role === 'admin') {
    return next();
  }
  next(new AppError('Forbidden — manager role required', 403));
}

export function isAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role === 'admin') {
    return next();
  }
  next(new AppError('Forbidden — admin role required', 403));
}
