import { Router } from 'express';
import { verifyToken } from '../middleware/authMiddleware';
import { getActiveShiftDefinitions } from '../controllers/shiftDefinitionController';

const router = Router();

router.get('/', verifyToken, getActiveShiftDefinitions);

export default router;
