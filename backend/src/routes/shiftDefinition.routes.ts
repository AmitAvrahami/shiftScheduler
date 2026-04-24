import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getActiveShiftDefinitions,
  getShiftDefinitionById,
  createShiftDefinition,
  updateShiftDefinition,
  deactivateShiftDefinition,
} from '../controllers/shiftDefinitionController';

const router = Router();

router.get('/', verifyToken, getActiveShiftDefinitions);
router.post('/', verifyToken, isManager, createShiftDefinition);
router.get('/:id', verifyToken, getShiftDefinitionById);
router.patch('/:id', verifyToken, isManager, updateShiftDefinition);
router.delete('/:id', verifyToken, isManager, deactivateShiftDefinition);

export default router;
