import { Router, Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'ShiftScheduler API is running',
    timestamp: new Date(),
  });
});

// router.use('/auth', authRouter)
// router.use('/users', usersRouter)
// router.use('/constraints', constraintsRouter)
// router.use('/schedules', schedulesRouter)
// router.use('/shift-definitions', shiftDefinitionsRouter)
// router.use('/assignments', assignmentsRouter)
// router.use('/notifications', notificationsRouter)
// router.use('/audit-logs', auditLogsRouter)
// router.use('/settings', settingsRouter)

router.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

export default router;
