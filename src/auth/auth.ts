import express from 'express';
import * as authController from './controller/authController';

import { asyncHandler } from '../../shared/config/lib';
import { optimizeImage, uploadAvatar } from '../../shared/middleware/upload';
import { auth } from '../../shared/middleware/auth';

const router = express.Router();

router.post('/request-otp', asyncHandler(authController.registerStep1));

router.post('/verify-otp', asyncHandler(authController.registerStep2));

router.post(
   '/complete-profile',
   uploadAvatar,
   optimizeImage,
   asyncHandler(authController.registerStep3),
);

router.post('/refresh-token', asyncHandler(authController.refreshToken));

router.post('/logout', auth, asyncHandler(authController.logout));

router.post('/guest', asyncHandler(authController.registerGuest));

export default router;
