import { Router } from 'express';
import { verifyToken } from '../middleware/authMiddleware';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../controllers/notificationController';

const router = Router();

router.get('/', verifyToken, getMyNotifications);
router.patch('/read-all', verifyToken, markAllNotificationsRead);
router.patch('/:id/read', verifyToken, markNotificationRead);
router.delete('/:id', verifyToken, deleteNotification);

export default router;
