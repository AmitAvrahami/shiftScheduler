import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import ConstraintException from '../models/ConstraintException';
import Notification from '../models/Notification';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { isConstraintDeadlinePassed } from '../utils/weekUtils';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;

const createSchema = z.object({
  weekId: z.string().regex(WEEK_ID_RE, 'Invalid weekId format — expected YYYY-WNN'),
  note: z.string().trim().optional(),
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'deny']),
  managerNote: z.string().trim().optional(),
});

export async function createException(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const { weekId, note } = parsed.data;
    const employeeId = req.user!._id;

    if (!isConstraintDeadlinePassed(weekId)) {
      return next(new AppError('Constraint window is still open for this week', 400));
    }

    const existing = await ConstraintException.findOne({
      employeeId,
      weekId,
      status: { $in: ['pending', 'approved'] },
    });
    if (existing) {
      return next(new AppError('An active unlock request already exists for this week', 409));
    }

    const exception = await ConstraintException.create({
      employeeId,
      weekId,
      status: 'pending',
      requestedAt: new Date(),
      note,
    });

    await AuditLog.create({
      performedBy: employeeId,
      action: 'constraint_exception_requested',
      refModel: 'ConstraintException',
      refId: exception._id,
      after: { weekId },
      ip: req.ip,
    });

    res.status(201).json({ success: true, exception });
  } catch (err) {
    next(err);
  }
}

export async function reviewException(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const exception = await ConstraintException.findById(req.params.id);
    if (!exception) return next(new AppError('Exception request not found', 404));

    if (exception.status !== 'pending') {
      return next(new AppError(`Cannot review an exception with status '${exception.status}'`, 422));
    }

    const { action, managerNote } = parsed.data;
    exception.status = action === 'approve' ? 'approved' : 'denied';
    exception.reviewedBy = req.user!._id as unknown as typeof exception.reviewedBy;
    exception.reviewedAt = new Date();
    if (managerNote) exception.managerNote = managerNote;
    await exception.save();

    const auditAction =
      action === 'approve' ? 'constraint_exception_granted' : 'constraint_exception_denied';

    await AuditLog.create({
      performedBy: req.user!._id,
      action: auditAction,
      targetUserId: String(exception.employeeId),
      refModel: 'ConstraintException',
      refId: exception._id,
      before: { status: 'pending' },
      after: { status: exception.status, weekId: exception.weekId },
      ip: req.ip,
    });

    await Notification.create({
      userId: exception.employeeId,
      type: 'constraint_updated',
      title: action === 'approve' ? 'בקשת הסרת נעילה אושרה' : 'בקשת הסרת נעילה נדחתה',
      body:
        action === 'approve'
          ? `בקשתך להגשת אילוצים לשבוע ${exception.weekId} אושרה`
          : `בקשתך להגשת אילוצים לשבוע ${exception.weekId} נדחתה`,
      refModel: 'ConstraintException',
      refId: exception._id,
    });

    res.json({ success: true, exception });
  } catch (err) {
    next(err);
  }
}

export async function getExceptions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const filter: Record<string, unknown> = isManagerOrAdmin
      ? {}
      : { employeeId: req.user!._id };

    if (req.query.weekId) filter.weekId = req.query.weekId;
    if (req.query.status) filter.status = req.query.status;

    const exceptions = await ConstraintException.find(filter).sort({ requestedAt: -1 });
    res.json({ success: true, exceptions });
  } catch (err) {
    next(err);
  }
}
