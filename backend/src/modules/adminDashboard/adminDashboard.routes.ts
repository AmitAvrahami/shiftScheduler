import { Router } from 'express';
import { verifyToken, isManager } from '../../middleware/authMiddleware';
import { getAdminDashboard } from './adminDashboard.controller';

const router = Router();

router.get('/:weekId', verifyToken, isManager, getAdminDashboard);

export default router;
