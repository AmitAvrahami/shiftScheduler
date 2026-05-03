import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import SystemSettings from '../models/SystemSettings';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

const upsertSchema = z.object({
  value: z.unknown(),
  description: z.string().optional(),
});

export async function getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getSettings - start');
  try {
    const settings = await SystemSettings.find({}).sort({ key: 1 });
    res.json({ success: true, settings });
    logger.info('getSettings - end', { count: settings.length });
  } catch (err) {
    logger.error('getSettings - error', err);
    next(err);
  }
}

export async function getSettingByKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getSettingByKey - start', { key: req.params.key });
  try {
    const setting = await SystemSettings.findOne({ key: req.params.key });
    if (!setting) return next(new AppError('Setting not found', 404));
    res.json({ success: true, setting });
    logger.info('getSettingByKey - end', { key: req.params.key });
  } catch (err) {
    logger.error('getSettingByKey - error', err);
    next(err);
  }
}

export async function upsertSetting(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('upsertSetting - start', { key: req.params.key });
  try {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const before = await SystemSettings.findOne({ key: req.params.key });

    const setting = await SystemSettings.findOneAndUpdate(
      { key: req.params.key },
      {
        $set: {
          value: parsed.data.value,
          description: parsed.data.description,
          updatedBy: req.user!._id,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'setting_updated',
      refModel: 'SystemSettings',
      refId: setting._id,
      before: before?.toObject() ?? null,
      after: { key: req.params.key, value: parsed.data.value },
      ip: req.ip,
    });

    res.json({ success: true, setting });
    logger.info('upsertSetting - end', { key: req.params.key });
  } catch (err) {
    logger.error('upsertSetting - error', err);
    next(err);
  }
}

export async function deleteSetting(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('deleteSetting - start', { key: req.params.key });
  try {
    const setting = await SystemSettings.findOneAndDelete({ key: req.params.key });
    if (!setting) return next(new AppError('Setting not found', 404));

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'setting_deleted',
      refModel: 'SystemSettings',
      refId: setting._id,
      before: setting.toObject(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Setting deleted' });
    logger.info('deleteSetting - end', { key: req.params.key });
  } catch (err) {
    logger.error('deleteSetting - error', err);
    next(err);
  }
}
