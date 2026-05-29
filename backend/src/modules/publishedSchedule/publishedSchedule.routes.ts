import { Router } from 'express';
import { verifyToken } from '../../middleware/authMiddleware';
import { getPublishedScheduleView } from './publishedSchedule.controller';

const router = Router();

router.get('/:id/published-view', verifyToken, getPublishedScheduleView);

export default router;
