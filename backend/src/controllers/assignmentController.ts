import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Assignment from '../models/Assignment';
import Shift from '../models/Shift';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';

const createSchema = z.object({
  shiftId: z.string().min(1),
  userId: z.string().min(1),
  scheduleId: z.string().min(1),
  assignedBy: z.enum(['algorithm', 'manager']),
});

const managerUpdateSchema = z.object({
  status: z.enum(['confirmed', 'pending']).optional(),
  assignedBy: z.enum(['algorithm', 'manager']).optional(),
});

const employeeUpdateSchema = z.object({
  status: z.literal('confirmed'),
});

export async function getAssignments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';

    const filter: Record<string, unknown> = isManagerOrAdmin
      ? {}
      : { userId: req.user!._id };

    if (req.query.scheduleId) filter.scheduleId = req.query.scheduleId;
    if (req.query.userId && isManagerOrAdmin) filter.userId = req.query.userId;

    const assignments = await Assignment.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, assignments });
  } catch (err) {
    next(err);
  }
}

export async function createAssignment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const shift = await Shift.findById(parsed.data.shiftId);
    if (!shift) return next(new AppError('Shift not found', 404));

    const user = await User.findById(parsed.data.userId);
    if (!user) return next(new AppError('User not found', 404));

    const assignment = await Assignment.create(parsed.data);

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'assignment_created',
      targetUserId: parsed.data.userId,
      refModel: 'Assignment',
      refId: assignment._id,
      after: parsed.data,
      ip: req.ip,
    });

    res.status(201).json({ success: true, assignment });
  } catch (err) {
    next(err);
  }
}

export async function getAssignmentById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return next(new AppError('Assignment not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    if (!isManagerOrAdmin && String(assignment.userId) !== req.user!._id) {
      return next(new AppError('Assignment not found', 404));
    }

    res.json({ success: true, assignment });
  } catch (err) {
    next(err);
  }
}

export async function updateAssignment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return next(new AppError('Assignment not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const isOwn = String(assignment.userId) === req.user!._id;

    if (!isManagerOrAdmin && !isOwn) {
      return next(new AppError('Assignment not found', 404));
    }

    const schema = isManagerOrAdmin ? managerUpdateSchema : employeeUpdateSchema;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    if (!isManagerOrAdmin) {
      if (assignment.status !== 'pending') {
        return next(new AppError('Assignment is already confirmed', 422));
      }
    }

    const before = assignment.toObject();
    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === 'confirmed') update.confirmedAt = new Date();

    const updated = await Assignment.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'assignment_updated',
      targetUserId: String(assignment.userId),
      refModel: 'Assignment',
      refId: assignment._id,
      before,
      after: parsed.data,
      ip: req.ip,
    });

    if (isManagerOrAdmin && before.assignedBy === 'algorithm') {
      await AuditLog.create({
        performedBy: req.user!._id,
        action: 'assignment_override',
        targetUserId: String(assignment.userId),
        refModel: 'Assignment',
        refId: assignment._id,
        before,
        after: parsed.data,
        ip: req.ip,
      });
    }

    res.json({ success: true, assignment: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteAssignment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return next(new AppError('Assignment not found', 404));

    await Assignment.findByIdAndDelete(assignment._id);

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'assignment_deleted',
      targetUserId: String(assignment.userId),
      refModel: 'Assignment',
      refId: assignment._id,
      before: assignment.toObject(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    next(err);
  }
}
