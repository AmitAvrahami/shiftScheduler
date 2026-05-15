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
  resolveLockMode,
  type LockMode,
} from '../utils/weekUtils';

import { broadcastToEmployees } from '../services/notificationService';
import WeeklySchedule from '../models/WeeklySchedule';
import { logger } from '../utils/logger';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  definitionId: z.string().min(1),
  canWork: z.boolean(),
});

const upsertSchema = z.object({
  entries: z.array(entrySchema),
});

const lockStateSchema = z.object({
  lockMode: z.enum(['default', 'force_locked', 'force_unlocked']),
});

interface WeekLockState {
  deadline: Date;
  deadlinePassed: boolean;
  lockMode: LockMode;
  isScheduleLocked: boolean;
  weekStatus: string | null;
  isLocked: boolean;
  isExplicitlyLocked: boolean;
}

/**
 * Single source of truth for whether constraint submission is locked for a week.
 * - force_locked  → always locked
 * - force_unlocked → unlocked, but a non-open schedule still locks (overrides deadline only)
 * - default        → locked once the deadline passes or the schedule leaves 'open'
 */
async function computeWeekLock(weekId: string): Promise<WeekLockState> {
  const deadline = getConstraintDeadline(weekId);
  const deadlinePassed = isConstraintDeadlinePassed(weekId);

  const lockSetting = await SystemSettings.findOne({ key: `lock_constraints_${weekId}` });
  const lockMode = resolveLockMode(lockSetting?.value);

  const scheduleDoc = await WeeklySchedule.findOne({ weekId }).lean();
  const isScheduleLocked = !!scheduleDoc && scheduleDoc.status !== 'open';
  const weekStatus = scheduleDoc?.status ?? null;

  let isLocked: boolean;
  if (lockMode === 'force_locked') {
    isLocked = true;
  } else if (lockMode === 'force_unlocked') {
    isLocked = isScheduleLocked;
  } else {
    isLocked = deadlinePassed || isScheduleLocked;
  }

  return {
    deadline,
    deadlinePassed,
    lockMode,
    isScheduleLocked,
    weekStatus,
    isLocked,
    isExplicitlyLocked: lockMode === 'force_locked',
  };
}

/**
 * Persists the lock mode for a week and emits the audit log + employee broadcast.
 */
async function writeLockMode(
  weekId: string,
  lockMode: LockMode,
  performedBy: unknown,
  ip: string | undefined
): Promise<void> {
  const key = `lock_constraints_${weekId}`;
  const setting = await SystemSettings.findOneAndUpdate(
    { key },
    {
      $set: {
        value: lockMode,
        description: `Constraint lock mode for week ${weekId}`,
        updatedBy: performedBy,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  const locked = lockMode === 'force_locked';
  await AuditLog.create({
    performedBy,
    action: locked ? 'week_locked' : 'week_unlocked',
    refModel: 'SystemSettings',
    refId: setting._id,
    after: { weekId, lockMode },
    ip,
  });

  const title = locked
    ? `הגשת אילוצים לשבוע ${weekId} ננעלה`
    : `הגשת אילוצים לשבוע ${weekId} נפתחה`;
  const body = locked
    ? `המנהל נעל את האפשרות להגיש אילוצים לשבוע ${weekId}.`
    : `המנהל פתח את האפשרות להגיש אילוצים לשבוע ${weekId}. ניתן להגיש כעת.`;
  await broadcastToEmployees(title, body, 'announcement', setting._id, 'SystemSettings');
}

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
  logger.info('getMyConstraints - start', { weekId: req.params.weekId, userId: req.user?._id });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraint = await Constraint.findOne({ userId: req.user!._id, weekId });
    const lock = await computeWeekLock(weekId);

    res.json({
      success: true,
      constraint: constraint ?? null,
      deadline: lock.deadline.toISOString(),
      isLocked: lock.isLocked,
      lockMode: lock.lockMode,
      weekStatus: lock.weekStatus,
    });
    logger.info('getMyConstraints - end', { weekId, found: !!constraint });
  } catch (err) {
    logger.error('getMyConstraints - error', err);
    next(err);
  }
}

// PUT /constraints/:weekId — employee upserts own constraints (deadline enforced)
export async function upsertMyConstraints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('upsertMyConstraints - start', { weekId: req.params.weekId, userId: req.user?._id });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    if (req.user!.role === 'employee') {
      const { isLocked, lockMode, isExplicitlyLocked, isScheduleLocked } =
        await computeWeekLock(weekId);

      if (isLocked) {
        const exception = await ConstraintException.findOne({
          employeeId: req.user!._id,
          weekId,
          status: 'approved',
        });
        if (!exception) {
          const message = isExplicitlyLocked
            ? 'הגשת אילוצים לשבוע זה ננעלה על ידי המנהל.'
            : isScheduleLocked
              ? 'הגשת אילוצים ננעלה כי השבוע עבר לשלב הבא.'
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
      } else if (lockMode !== 'force_unlocked') {
        // force_unlocked reopens this specific week for self-submission,
        // so the normal "only the current allowed week" restriction is skipped.
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
    logger.info('upsertMyConstraints - end', { weekId });
  } catch (err) {
    logger.error('upsertMyConstraints - error', err);
    next(err);
  }
}

// GET /constraints/:weekId/all — manager gets all constraints for a week
export async function getAllConstraintsForWeek(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getAllConstraintsForWeek - start', { weekId: req.params.weekId });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraints = await Constraint.find({ weekId }).populate(
      'userId',
      'name email role avatarUrl'
    );
    const lock = await computeWeekLock(weekId);

    res.json({
      success: true,
      constraints,
      deadline: lock.deadline.toISOString(),
      isLocked: lock.isLocked,
      isExplicitlyLocked: lock.isExplicitlyLocked,
      lockMode: lock.lockMode,
      weekStatus: lock.weekStatus,
    });
    logger.info('getAllConstraintsForWeek - end', { weekId, count: constraints.length });
  } catch (err) {
    logger.error('getAllConstraintsForWeek - error', err);
    next(err);
  }
}

// POST /constraints/:weekId/toggle-lock — manager toggle week lock (legacy boolean API)
export async function toggleWeekLock(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('toggleWeekLock - start', { weekId: req.params.weekId, body: req.body });
  try {
    const { weekId } = req.params;
    const { isLocked } = req.body;

    if (!validateWeekId(weekId, next)) return;

    // true → force_locked, false → force_unlocked so the manager can reopen a
    // week even after the deadline has passed.
    const lockMode: LockMode = isLocked ? 'force_locked' : 'force_unlocked';
    await writeLockMode(weekId, lockMode, req.user!._id, req.ip);

    const lock = await computeWeekLock(weekId);
    res.json({ success: true, isLocked: lock.isLocked, lockMode: lock.lockMode });
    logger.info('toggleWeekLock - end', { weekId, lockMode });
  } catch (err) {
    logger.error('toggleWeekLock - error', err);
    next(err);
  }
}

// POST /constraints/:weekId/lock-state — manager sets explicit lock mode
export async function setWeekLockState(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('setWeekLockState - start', { weekId: req.params.weekId, body: req.body });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const parsed = lockStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    await writeLockMode(weekId, parsed.data.lockMode, req.user!._id, req.ip);

    const lock = await computeWeekLock(weekId);
    res.json({ success: true, lockMode: lock.lockMode, isLocked: lock.isLocked });
    logger.info('setWeekLockState - end', { weekId, lockMode: parsed.data.lockMode });
  } catch (err) {
    logger.error('setWeekLockState - error', err);
    next(err);
  }
}

// GET /constraints/:weekId/users/:userId — manager reads a specific user's constraints
export async function getConstraintsForUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getConstraintsForUser - start', {
    weekId: req.params.weekId,
    userId: req.params.userId,
  });
  try {
    const { weekId, userId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const constraint = await Constraint.findOne({ userId, weekId });
    const lock = await computeWeekLock(weekId);

    res.json({
      success: true,
      constraint: constraint ?? null,
      deadline: lock.deadline.toISOString(),
      isLocked: lock.isLocked,
      lockMode: lock.lockMode,
    });
    logger.info('getConstraintsForUser - end', { weekId, userId, found: !!constraint });
  } catch (err) {
    logger.error('getConstraintsForUser - error', err);
    next(err);
  }
}

// PUT /constraints/:weekId/users/:userId — manager override (bypasses deadline)
export async function managerOverrideConstraints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('managerOverrideConstraints - start', {
    weekId: req.params.weekId,
    userId: req.params.userId,
  });
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
    logger.info('managerOverrideConstraints - end', { weekId, userId });
  } catch (err) {
    logger.error('managerOverrideConstraints - error', err);
    next(err);
  }
}
