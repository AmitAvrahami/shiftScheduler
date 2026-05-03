import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import AppError from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { fetchDashboardData } from './adminDashboard.service';
import { toAdminDashboardDTO } from './adminDashboard.mapper';

const weekIdSchema = z.object({
  weekId: z.string().regex(/^\d{4}-W\d{2}$/, 'Invalid weekId — expected YYYY-WNN'),
});

export async function getAdminDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  logger.info('getAdminDashboard - start', { weekId: req.params.weekId });
  try {
    const parsed = weekIdSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const { weekId } = parsed.data;
    const raw = await fetchDashboardData(weekId);
    const dto = toAdminDashboardDTO(raw);

    res.status(200).json({ success: true, data: dto });
    logger.info('getAdminDashboard - end', { weekId });
  } catch (err) {
    logger.error('getAdminDashboard - error', err);
    next(err);
  }
}
