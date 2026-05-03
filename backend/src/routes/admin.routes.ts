import { Router } from 'express';
import { verifyToken, isManager, isAdmin } from '../middleware/authMiddleware';
import { getDashboard, generateShifts, initializeWeek } from '../controllers/adminController';
import adminDashboardRouter from '../modules/adminDashboard/adminDashboard.routes';

const router = Router();

// Modular dashboard: GET /admin/dashboard/:weekId (path param, new DTO shape)
router.use('/dashboard', adminDashboardRouter);

// Legacy dashboard: GET /admin/dashboard?weekId= (query param, kept for backwards compat)
router.get('/dashboard', verifyToken, isManager, getDashboard);
router.post('/weeks/initialize', verifyToken, isManager, initializeWeek);
router.post('/weeks/:weekId/shifts', verifyToken, isAdmin, generateShifts);

export default router;
