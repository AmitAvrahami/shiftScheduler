import { Router, Request, Response } from 'express';
import { register, login } from '../controllers/authController';
import { verifyToken, isManager } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', verifyToken, isManager, register);
router.post('/login', login);

router.get('/me', verifyToken, (req: Request, res: Response) => {
  res.json({ success: true, user: req.user });
});

export default router;
