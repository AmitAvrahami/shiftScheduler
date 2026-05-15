import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getMyConstraints,
  upsertMyConstraints,
  getConstraintsForUser,
  managerOverrideConstraints,
  getAllConstraintsForWeek,
  toggleWeekLock,
  setWeekLockState,
} from '../controllers/constraintController';

const router = Router();

router.get('/:weekId', verifyToken, getMyConstraints);
router.put('/:weekId', verifyToken, upsertMyConstraints);

// Manager only routes
router.get('/:weekId/all', verifyToken, isManager, getAllConstraintsForWeek);
router.post('/:weekId/toggle-lock', verifyToken, isManager, toggleWeekLock);
router.post('/:weekId/lock-state', verifyToken, isManager, setWeekLockState);
router.get('/:weekId/users/:userId', verifyToken, isManager, getConstraintsForUser);
router.put('/:weekId/users/:userId', verifyToken, isManager, managerOverrideConstraints);

export default router;
