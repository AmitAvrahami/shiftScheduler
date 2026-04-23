import { Router } from 'express';
import { getUsers, updateUserStatus, updateFixedMorning } from '../controllers/authController';
import { verifyToken, isManager } from '../middleware/authMiddleware';

const router = Router();

router.get('/', verifyToken, isManager, getUsers);
router.patch('/:id/status', verifyToken, isManager, updateUserStatus);
router.patch('/:id/fixed-morning', verifyToken, isManager, updateFixedMorning);

export default router;
