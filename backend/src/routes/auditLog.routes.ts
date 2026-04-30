import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import { getAuditLogs, getAuditLogById } from '../controllers/auditLogController';

const router = Router();

router.get('/', verifyToken, isManager, getAuditLogs);
router.get('/:id', verifyToken, isManager, getAuditLogById);

export default router;
