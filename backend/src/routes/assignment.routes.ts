import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getAssignments,
  createAssignment,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
} from '../controllers/assignmentController';

const router = Router();

router.get('/', verifyToken, getAssignments);
router.post('/', verifyToken, isManager, createAssignment);
router.get('/:id', verifyToken, getAssignmentById);
router.patch('/:id', verifyToken, updateAssignment);
router.delete('/:id', verifyToken, isManager, deleteAssignment);

export default router;
