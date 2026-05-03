import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getShifts,
  createShift,
  getShiftById,
  updateShift,
  deleteShift,
} from '../controllers/shiftController';

const router = Router();

router.get('/', verifyToken, getShifts);
router.post('/', verifyToken, isManager, createShift);
router.get('/:id', verifyToken, getShiftById);
router.patch('/:id', verifyToken, isManager, updateShift);
router.put('/:id', verifyToken, isManager, updateShift);
router.delete('/:id', verifyToken, isManager, deleteShift);

export default router;
