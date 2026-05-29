import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getSchedules,
  createSchedule,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  generateSchedule,
  generateDemoSchedule,
  cloneSchedule,
  initializeWeekShifts,
  getWeekShifts,
} from '../controllers/scheduleController';
import publishedScheduleRouter from '../modules/publishedSchedule/publishedSchedule.routes';

const router = Router();

router.get('/', verifyToken, getSchedules);
router.use('/', publishedScheduleRouter);
router.post('/', verifyToken, isManager, createSchedule);
router.post('/:weekId/generate', verifyToken, isManager, generateSchedule);
router.post('/:weekId/generate-demo', verifyToken, isManager, generateDemoSchedule);
router.post('/:weekId/shifts/initialize', verifyToken, isManager, initializeWeekShifts);
router.get('/:weekId/shifts', verifyToken, isManager, getWeekShifts);
router.post('/:id/clone', verifyToken, isManager, cloneSchedule);
router.get('/:id', verifyToken, getScheduleById);
router.patch('/:id', verifyToken, isManager, updateSchedule);
router.delete('/:id', verifyToken, isManager, deleteSchedule);

export default router;
