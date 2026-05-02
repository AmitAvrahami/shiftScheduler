import { Request, Response, NextFunction } from 'express';
import SystemSettings from '../models/SystemSettings';
import WeeklySchedule from '../models/WeeklySchedule';
import {
  getCurrentWeekId,
  getAllowedWeekId,
  getConstraintDeadline,
  isConstraintDeadlinePassed,
} from '../utils/weekUtils';
import { logger } from '../utils/logger';

export async function getWorkflowStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getWorkflowStatus - start');
  try {
    const currentWeekId = getCurrentWeekId();

    const [settingDoc, schedule] = await Promise.all([
      SystemSettings.findOne({ key: 'workflow_state' }).lean(),
      WeeklySchedule.findOne({ weekId: currentWeekId }).lean(),
    ]);

    res.json({
      success: true,
      workflow: {
        currentWeekId,
        allowedConstraintWeekId: getAllowedWeekId(),
        constraintDeadline: getConstraintDeadline(currentWeekId).toISOString(),
        isConstraintWindowLocked: isConstraintDeadlinePassed(currentWeekId),
        workflowState: settingDoc ? (settingDoc.value as string) : null,
        activeSchedule: schedule
          ? {
              _id: schedule._id,
              status: schedule.status,
              publishedAt: schedule.publishedAt ?? null,
            }
          : null,
      },
    });
    logger.info('getWorkflowStatus - end');
  } catch (err) {
    logger.error('getWorkflowStatus - error', err);
    next(err);
  }
}
