import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  broadcastMessage,
  getBroadcastStatus,
} from '../controllers/notificationController';

const router = Router();

router.get('/', verifyToken, getMyNotifications);
router.patch('/read-all', verifyToken, markAllNotificationsRead);
// Broadcast routes must come before /:id wildcard
router.post('/broadcast', verifyToken, isManager, broadcastMessage);
router.get('/broadcast/:broadcastId/status', verifyToken, isManager, getBroadcastStatus);
router.patch('/:id/read', verifyToken, markNotificationRead);
router.delete('/:id', verifyToken, deleteNotification);

export default router;
