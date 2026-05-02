import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { code: err.code, stack: err.stack });
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
    return;
  }

  logger.error(`Unhandled Exception: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
}
