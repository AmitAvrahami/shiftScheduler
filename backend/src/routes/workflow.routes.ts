import { Router } from 'express';
import { verifyToken } from '../middleware/authMiddleware';
import { getWorkflowStatus } from '../controllers/workflowController';

const router = Router();

router.get('/status', verifyToken, getWorkflowStatus);

export default router;
