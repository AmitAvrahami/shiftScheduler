import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getAuditLogs - start', { query: req.query });
  try {
    const filter: Record<string, unknown> = {};

    if (req.query.action) filter.action = req.query.action;
    if (req.query.performedBy) filter.performedBy = req.query.performedBy;
    if (req.query.targetUserId) filter.targetUserId = req.query.targetUserId;

    if (req.query.from || req.query.to) {
      const dateFilter: Record<string, Date> = {};
      if (req.query.from) dateFilter.$gte = new Date(req.query.from as string);
      if (req.query.to) dateFilter.$lte = new Date(req.query.to as string);
      filter.createdAt = dateFilter;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, logs, total, page, limit });
    logger.info('getAuditLogs - end', { count: logs.length, total });
  } catch (err) {
    logger.error('getAuditLogs - error', err);
    next(err);
  }
}

export async function getAuditLogById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getAuditLogById - start', { id: req.params.id });
  try {
    const log = await AuditLog.findById(req.params.id);
    if (!log) return next(new AppError('Audit log not found', 404));
    res.json({ success: true, log });
    logger.info('getAuditLogById - end', { id: req.params.id });
  } catch (err) {
    logger.error('getAuditLogById - error', err);
    next(err);
  }
}
