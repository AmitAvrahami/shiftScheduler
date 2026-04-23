import { Router } from 'express';
import { verifyToken, isManager } from '../middleware/authMiddleware';
import {
  getMyConstraints,
  upsertMyConstraints,
  getConstraintsForUser,
  managerOverrideConstraints,
} from '../controllers/constraintController';

const router = Router();

router.get('/:weekId', verifyToken, getMyConstraints);
router.put('/:weekId', verifyToken, upsertMyConstraints);
router.get('/:weekId/users/:userId', verifyToken, isManager, getConstraintsForUser);
router.put('/:weekId/users/:userId', verifyToken, isManager, managerOverrideConstraints);

export default router;
