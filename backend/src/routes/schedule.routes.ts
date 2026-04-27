import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getSchedules,
  createSchedule,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  generateSchedule,
} from '../controllers/scheduleController';

const router = Router();

router.get('/', verifyToken, getSchedules);
router.post('/', verifyToken, isManager, createSchedule);
router.post('/:weekId/generate', verifyToken, isManager, generateSchedule);
router.get('/:id', verifyToken, getScheduleById);
router.patch('/:id', verifyToken, isManager, updateSchedule);
router.delete('/:id', verifyToken, isManager, deleteSchedule);

export default router;
