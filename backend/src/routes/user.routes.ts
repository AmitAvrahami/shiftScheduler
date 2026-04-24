import { Router } from 'express';
import {
  getUsers,
  updateUserStatus,
  updateFixedMorning,
  resetPassword,
} from '../controllers/authController';
import { getUserById, updateUser, softDeleteUser } from '../controllers/userController';
import { verifyToken, isManager, isAdmin } from '../middleware/authMiddleware';

const router = Router();

router.get('/', verifyToken, isManager, getUsers);
router.get('/:id', verifyToken, getUserById);
router.patch('/:id/status', verifyToken, isManager, updateUserStatus);
router.patch('/:id/password', verifyToken, isManager, resetPassword);
router.patch('/:id/fixed-morning', verifyToken, isManager, updateFixedMorning);
router.patch('/:id', verifyToken, updateUser);
router.delete('/:id', verifyToken, isAdmin, softDeleteUser);

export default router;
