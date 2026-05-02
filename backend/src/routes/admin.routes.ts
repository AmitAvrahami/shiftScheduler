import { Router } from 'express';
import { verifyToken, isAdmin } from '../middleware/authMiddleware';
import { getDashboard, generateShifts } from '../controllers/adminController';

const router = Router();

router.get('/dashboard', verifyToken, isAdmin, getDashboard);
router.post('/weeks/:weekId/shifts', verifyToken, isAdmin, generateShifts);

export default router;
