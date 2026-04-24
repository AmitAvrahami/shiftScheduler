import { Request, Response, NextFunction } from 'express';
import Notification from '../models/Notification';
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
