import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Constraint from '../models/Constraint';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import User from '../models/User';
import AppError from '../utils/AppError';
import {
  getConstraintDeadline,
  isConstraintDeadlinePassed,
  getAllowedWeekId,
  parseWeekId,
} from '../utils/weekUtils';

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
      const allowed = getAllowedWeekId();
      if (weekId !== allowed) {
        return next(new AppError(`ניתן להגיש אילוצים רק לשבוע ${allowed}`, 403));
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
