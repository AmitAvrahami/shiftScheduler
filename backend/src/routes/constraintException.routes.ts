import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  createException,
  reviewException,
  getExceptions,
} from '../controllers/constraintExceptionController';

const router = Router();

router.post('/', verifyToken, createException);
router.get('/', verifyToken, getExceptions);
router.patch('/:id/review', verifyToken, isManager, reviewException);

export default router;
