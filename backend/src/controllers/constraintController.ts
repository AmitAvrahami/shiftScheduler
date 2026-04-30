import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Constraint from '../models/Constraint';
import ConstraintException from '../models/ConstraintException';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import User from '../models/User';
import SystemSettings from '../models/SystemSettings';
import AppError from '../utils/AppError';
import {
  getConstraintDeadline,
  isConstraintDeadlinePassed,
  getAllowedWeekId,
  parseWeekId,
} from '../utils/weekUtils';

import { broadcastToEmployees } from '../services/notificationService';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  definitionId: z.string().min(1),
  canWork: z.boolean(),
});

const upsertSchema = z.object({
  entries: z.array(entrySchema),
});

function validateWeekId(weekId: string, next: NextFunction): boolean {
  if (!WEEK_ID_RE.test(weekId)) {
    next(new AppError('Invalid weekId format — expected YYYY-WNN', 400));
    return false;
  }
  try {
    parseWeekId(weekId);
    return true;
  } catch {
    next(new AppError('Invalid weekId format — expected YYYY-WNN', 400));
    return false;
  }
}

// GET /constraints/:weekId — employee gets own constraints
export async function getMyConstraints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraint = await Constraint.findOne({ userId: req.user!._id, weekId });
    const deadline = getConstraintDeadline(weekId);
    const deadlinePassed = isConstraintDeadlinePassed(weekId);

    // Check for explicit lock in settings
    const lockSetting = await SystemSettings.findOne({ key: `lock_constraints_${weekId}` });
    const isExplicitlyLocked = !!lockSetting?.value;
    const isLocked = deadlinePassed || isExplicitlyLocked;

    res.json({
      success: true,
      constraint: constraint ?? null,
      deadline: deadline.toISOString(),
      isLocked,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /constraints/:weekId — employee upserts own constraints (deadline enforced)
export async function upsertMyConstraints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    if (req.user!.role === 'employee') {
      const deadlinePassed = isConstraintDeadlinePassed(weekId);
      const lockSetting = await SystemSettings.findOne({ key: `lock_constraints_${weekId}` });
      const isExplicitlyLocked = !!lockSetting?.value;

      if (deadlinePassed || isExplicitlyLocked) {
        const exception = await ConstraintException.findOne({
          employeeId: req.user!._id,
          weekId,
          status: 'approved',
        });
        if (!exception) {
          const message = isExplicitlyLocked
            ? 'הגשת אילוצים לשבוע זה ננעלה על ידי המנהל.'
            : 'Deadline passed. Request an unlock from your manager.';
          return next(new AppError(message, 403));
        }
        // Consume the exception — single use
        exception.status = 'consumed';
        exception.consumedAt = new Date();
        await exception.save();
        await AuditLog.create({
          performedBy: req.user!._id,
          action: 'constraint_exception_consumed',
          refModel: 'ConstraintException',
          refId: exception._id,
          after: { weekId },
          ip: req.ip,
        });
      } else {
        const allowed = getAllowedWeekId();
        if (weekId !== allowed) {
          return next(new AppError(`ניתן להגיש אילוצים רק לשבוע ${allowed}`, 403));
        }
      }
    }

    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const constraint = await Constraint.findOneAndUpdate(
      { userId: req.user!._id, weekId },
      {
        $set: {
          entries: parsed.data.entries,
          submittedVia: 'self',
          submittedAt: new Date(),
          isLocked: false,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, constraint });
  } catch (err) {
    next(err);
  }
}

// GET /constraints/:weekId/all — manager gets all constraints for a week
export async function getAllConstraintsForWeek(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraints = await Constraint.find({ weekId }).populate('userId', 'name email role avatarUrl');
    const deadline = getConstraintDeadline(weekId);
    const deadlinePassed = isConstraintDeadlinePassed(weekId);

    const lockSetting = await SystemSettings.findOne({ key: `lock_constraints_${weekId}` });
    const isExplicitlyLocked = !!lockSetting?.value;

    res.json({
      success: true,
      constraints,
      deadline: deadline.toISOString(),
      isLocked: deadlinePassed || isExplicitlyLocked,
      isExplicitlyLocked,
    });
  } catch (err) {
    next(err);
  }
}

// POST /constraints/:weekId/toggle-lock — manager toggle week lock
export async function toggleWeekLock(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId } = req.params;
    const { isLocked } = req.body;

    if (!validateWeekId(weekId, next)) return;

    const key = `lock_constraints_${weekId}`;
    const setting = await SystemSettings.findOneAndUpdate(
      { key },
      {
        $set: {
          value: isLocked,
          description: `Manual lock for week ${weekId}`,
          updatedBy: req.user!._id,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      performedBy: req.user!._id,
      action: isLocked ? 'week_locked' : 'week_unlocked',
      refModel: 'SystemSettings',
      refId: setting._id,
      after: { weekId, isLocked },
      ip: req.ip,
    });

    // Send broadcast notification
    const title = isLocked ? `הגשת אילוצים לשבוע ${weekId} ננעלה` : `הגשת אילוצים לשבוע ${weekId} נפתחה`;
    const body = isLocked 
      ? `המנהל נעל את האפשרות להגיש אילוצים לשבוע ${weekId}.` 
      : `המנהל פתח את האפשרות להגיש אילוצים לשבוע ${weekId}. ניתן להגיש כעת.`;
    
    await broadcastToEmployees(title, body, 'announcement', setting._id, 'SystemSettings');

    res.json({ success: true, isLocked });
  } catch (err) {
    next(err);
  }
}

// GET /constraints/:weekId/users/:userId — manager reads a specific user's constraints
export async function getConstraintsForUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId, userId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraint = await Constraint.findOne({ userId, weekId });
    const deadline = getConstraintDeadline(weekId);
    const isLocked = isConstraintDeadlinePassed(weekId);

    res.json({
      success: true,
      constraint: constraint ?? null,
      deadline: deadline.toISOString(),
      isLocked,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /constraints/:weekId/users/:userId — manager override (bypasses deadline)
export async function managerOverrideConstraints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { weekId, userId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return next(new AppError('משתמש לא נמצא', 404));

    const constraint = await Constraint.findOneAndUpdate(
      { userId, weekId },
      {
        $set: {
          entries: parsed.data.entries,
          submittedVia: 'manager_override',
          overriddenBy: req.user!._id,
          submittedAt: new Date(),
          isLocked: false,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'constraint_override',
      targetUserId: userId,
      refModel: 'Constraint',
      refId: constraint._id,
      after: { entries: parsed.data.entries },
      ip: req.ip,
    });

    await Notification.create({
      userId,
      type: 'constraint_updated',
      title: 'אילוצים עודכנו על ידי המנהל',
      body: `המנהל עדכן את האילוצים שלך לשבוע ${weekId}`,
      refModel: 'Constraint',
      refId: constraint._id,
    });

    res.json({ success: true, constraint });
  } catch (err) {
    next(err);
  }
}
