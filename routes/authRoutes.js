import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  inviteMember,
} from '../controllers/authController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/invite', protect, admin, inviteMember);

export default router;