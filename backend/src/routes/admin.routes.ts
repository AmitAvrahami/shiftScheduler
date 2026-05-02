import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import { getDashboard, generateShifts, initializeWeek } from '../controllers/adminController';

const router = Router();

router.get('/dashboard', verifyToken, isManager, getDashboard);
router.post('/weeks/initialize', verifyToken, isManager, initializeWeek);
router.post('/weeks/:weekId/shifts', verifyToken, isManager, generateShifts);

export default router;
