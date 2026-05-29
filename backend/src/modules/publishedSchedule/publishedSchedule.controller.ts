import { Request, Response, NextFunction } from 'express';
import WeeklySchedule from '../../models/WeeklySchedule';
import Shift from '../../models/Shift';
import ShiftDefinition from '../../models/ShiftDefinition';
import Assignment from '../../models/Assignment';
import User from '../../models/User';
import AppError from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { mapShiftToDTO } from '../adminDashboard/adminDashboard.mapper';
import type {
  RawAssignmentDoc,
  RawShiftDefDoc,
  RawShiftDoc,
} from '../adminDashboard/adminDashboard.dto';
import type { PublishedScheduleDTO } from './publishedSchedule.dto';

export async function getPublishedScheduleView(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getPublishedScheduleView - start', { id: req.params.id });
  try {
    const schedule = await WeeklySchedule.findById(req.params.id).lean();
    if (!schedule) return next(new AppError('Schedule not found', 404));

    if (schedule.status !== 'published') {
      return next(new AppError('Schedule not published', 403));
    }

    const shifts = await Shift.find({ scheduleId: schedule._id }).lean();
    const assignments = await Assignment.find({ scheduleId: schedule._id }).lean();

    const definitionIds = [...new Set(shifts.map((shift) => String(shift.definitionId)))];
    const shiftDefinitions = await ShiftDefinition.find({ _id: { $in: definitionIds } })
      .select('_id name startTime')
      .lean();
    const defById = new Map<string, RawShiftDefDoc>(
      shiftDefinitions.map((definition) => [String(definition._id), definition as RawShiftDefDoc])
    );

    const employeeIds = [...new Set(assignments.map((assignment) => String(assignment.userId)))];
    const users = await User.find({ _id: { $in: employeeIds } })
      .select('_id name')
      .lean();

    const data: PublishedScheduleDTO = {
      schedule: {
        id: String(schedule._id),
        weekId: schedule.weekId,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        status: 'published',
        publishedAt: schedule.publishedAt,
      },
      shifts: shifts.map((shift) => mapShiftToDTO(shift as RawShiftDoc, defById)),
      assignments: assignments.map((assignment) => ({
        id: String((assignment as RawAssignmentDoc)._id),
        shiftId: String((assignment as RawAssignmentDoc).shiftId),
        employeeId: String((assignment as RawAssignmentDoc).userId),
      })),
      employees: users.map((user) => ({
        id: String(user._id),
        name: user.name,
      })),
    };

    res.json({ success: true, data });
    logger.info('getPublishedScheduleView - end', { id: req.params.id });
  } catch (err) {
    logger.error('getPublishedScheduleView - error', err);
    next(err);
  }
}
