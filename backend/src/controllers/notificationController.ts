import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Notification from '../models/Notification';
import User from '../models/User';
import AppError from '../utils/AppError';

export async function getMyNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filter: Record<string, unknown> = { userId: req.user!._id };

    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === 'true';
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, notifications });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return next(new AppError('Notification not found', 404));

    if (String(notification.userId) !== req.user!._id) {
      return next(new AppError('Notification not found', 404));
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await Notification.updateMany({ userId: req.user!._id, isRead: false }, { $set: { isRead: true } });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

export async function deleteNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return next(new AppError('Notification not found', 404));

    if (String(notification.userId) !== req.user!._id) {
      return next(new AppError('Notification not found', 404));
    }

    await Notification.findByIdAndDelete(notification._id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
}

const broadcastSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  userIds: z.array(z.string()).optional(),
});

// POST /notifications/broadcast — manager sends an announcement to employees
export async function broadcastMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) return next(new AppError(parsed.error.errors[0].message, 400));

    const { title, body, userIds } = parsed.data;
    const broadcastId = new mongoose.Types.ObjectId();

    let targets: string[];
    if (userIds && userIds.length > 0) {
      targets = userIds;
    } else {
      const employees = await User.find({ isActive: true, role: 'employee' }, '_id').lean();
      targets = employees.map((u) => String(u._id));
    }

    if (targets.length === 0) {
      return next(new AppError('No active employees to notify', 422));
    }

    await Notification.insertMany(
      targets.map((uid) => ({
        userId: uid,
        type: 'announcement',
        title,
        body,
        isRead: false,
        refId: broadcastId,
        refModel: 'Broadcast',
      }))
    );

    res.json({ success: true, broadcastId: broadcastId.toString(), recipientCount: targets.length });
  } catch (err) {
    next(err);
  }
}

// GET /notifications/broadcast/:broadcastId/status — manager checks read receipts
export async function getBroadcastStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { broadcastId } = req.params;
    const notifications = await Notification.find({
      refId: broadcastId,
      type: 'announcement',
    })
      .populate('userId', 'name email')
      .lean();

    const recipients = notifications.map((n) => {
      const u = n.userId as unknown as { _id: string; name: string; email: string };
      return { userId: String(u._id), name: u.name, isRead: n.isRead };
    });

    res.json({ success: true, recipients });
  } catch (err) {
    next(err);
  }
}
