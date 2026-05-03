import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import SwapRequest from '../models/SwapRequest';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import AppError from '../utils/AppError';
import { logger } from '../utils/logger';

const createSchema = z.object({
  targetUserId: z.string().min(1),
  requesterShiftId: z.string().min(1),
  targetShiftId: z.string().min(1),
  requesterNote: z.string().optional(),
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  managerNote: z.string().optional(),
});

export async function getSwapRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getSwapRequests - start');
  try {
    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';

    const filter = isManagerOrAdmin
      ? {}
      : { $or: [{ requesterId: req.user!._id }, { targetUserId: req.user!._id }] };

    const swapRequests = await SwapRequest.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, swapRequests });
    logger.info('getSwapRequests - end', { count: swapRequests.length });
  } catch (err) {
    logger.error('getSwapRequests - error', err);
    next(err);
  }
}

export async function createSwapRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('createSwapRequest - start', { requesterId: req.user!._id, targetUserId: req.body.targetUserId });
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const requesterAssignment = await Assignment.findById(parsed.data.requesterShiftId);
    if (!requesterAssignment) return next(new AppError('Requester assignment not found', 404));

    if (String(requesterAssignment.userId) !== req.user!._id) {
      const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
      if (!isManagerOrAdmin) return next(new AppError('Forbidden', 403));
    }

    const targetAssignment = await Assignment.findById(parsed.data.targetShiftId);
    if (!targetAssignment) return next(new AppError('Target assignment not found', 404));

    const swapRequest = await SwapRequest.create({
      requesterId: req.user!._id,
      targetUserId: parsed.data.targetUserId,
      requesterShiftId: parsed.data.requesterShiftId,
      targetShiftId: parsed.data.targetShiftId,
      requesterNote: parsed.data.requesterNote,
      status: 'pending',
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'swap_request_created',
      targetUserId: parsed.data.targetUserId,
      refModel: 'SwapRequest',
      refId: swapRequest._id,
      after: { targetUserId: parsed.data.targetUserId, status: 'pending' },
      ip: req.ip,
    });

    res.status(201).json({ success: true, swapRequest });
    logger.info('createSwapRequest - end', { id: swapRequest._id });
  } catch (err) {
    logger.error('createSwapRequest - error', err);
    next(err);
  }
}

export async function getSwapRequestById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('getSwapRequestById - start', { id: req.params.id });
  try {
    const swapRequest = await SwapRequest.findById(req.params.id);
    if (!swapRequest) return next(new AppError('Swap request not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const isParticipant =
      String(swapRequest.requesterId) === req.user!._id ||
      String(swapRequest.targetUserId) === req.user!._id;

    if (!isManagerOrAdmin && !isParticipant) {
      return next(new AppError('Swap request not found', 404));
    }

    res.json({ success: true, swapRequest });
    logger.info('getSwapRequestById - end', { id: req.params.id });
  } catch (err) {
    logger.error('getSwapRequestById - error', err);
    next(err);
  }
}

export async function updateSwapRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('updateSwapRequest - start', { id: req.params.id });
  try {
    const swapRequest = await SwapRequest.findById(req.params.id);
    if (!swapRequest) return next(new AppError('Swap request not found', 404));

    const isManagerOrAdmin = req.user!.role === 'manager' || req.user!.role === 'admin';
    const isRequester = String(swapRequest.requesterId) === req.user!._id;

    if (!isManagerOrAdmin && !isRequester) {
      return next(new AppError('Swap request not found', 404));
    }

    if (swapRequest.status !== 'pending') {
      return next(new AppError('Only pending swap requests can be updated', 422));
    }

    const before = swapRequest.toObject();

    if (isManagerOrAdmin) {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

      swapRequest.status = parsed.data.status;
      if (parsed.data.managerNote !== undefined) swapRequest.managerNote = parsed.data.managerNote;
      swapRequest.reviewedBy = req.user!._id as unknown as typeof swapRequest.reviewedBy;
      swapRequest.reviewedAt = new Date();
      await swapRequest.save();

      await Notification.create({
        userId: swapRequest.requesterId,
        type: 'swap_request_reviewed',
        title: parsed.data.status === 'approved' ? 'בקשת החלפה אושרה' : 'בקשת החלפה נדחתה',
        body: parsed.data.managerNote ?? `בקשת ההחלפה שלך ${parsed.data.status === 'approved' ? 'אושרה' : 'נדחתה'} על ידי המנהל`,
        refModel: 'SwapRequest',
        refId: swapRequest._id,
      });

      await AuditLog.create({
        performedBy: req.user!._id,
        action: 'swap_request_reviewed',
        targetUserId: String(swapRequest.requesterId),
        refModel: 'SwapRequest',
        refId: swapRequest._id,
        before,
        after: { status: parsed.data.status, managerNote: parsed.data.managerNote },
        ip: req.ip,
      });
    } else {
      const cancelSchema = z.object({ status: z.literal('rejected') });
      const parsed = cancelSchema.safeParse(req.body);
      if (!parsed.success) return next(new AppError('Employees can only cancel (status: rejected) their own pending requests', 400));

      swapRequest.status = 'rejected';
      await swapRequest.save();

      await AuditLog.create({
        performedBy: req.user!._id,
        action: 'swap_request_cancelled',
        refModel: 'SwapRequest',
        refId: swapRequest._id,
        before,
        after: { status: 'rejected' },
        ip: req.ip,
      });
    }

    res.json({ success: true, swapRequest });
    logger.info('updateSwapRequest - end', { id: req.params.id, status: swapRequest.status });
  } catch (err) {
    logger.error('updateSwapRequest - error', err);
    next(err);
  }
}

export async function deleteSwapRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('deleteSwapRequest - start', { id: req.params.id });
  try {
    const swapRequest = await SwapRequest.findById(req.params.id);
    if (!swapRequest) return next(new AppError('Swap request not found', 404));

    await SwapRequest.findByIdAndDelete(swapRequest._id);

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'swap_request_deleted',
      refModel: 'SwapRequest',
      refId: swapRequest._id,
      before: swapRequest.toObject(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Swap request deleted' });
    logger.info('deleteSwapRequest - end', { id: req.params.id });
  } catch (err) {
    logger.error('deleteSwapRequest - error', err);
    next(err);
  }
}
