import express from 'express';
import { auth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import * as notificationController from './controller/notificationController';

const router = express.Router();

router.get('/', auth, asyncHandler(notificationController.getMyNotifications));
router.patch(
   '/:notificationId/read',
   auth,
   asyncHandler(notificationController.markAsRead),
);
router.post(
   '/',
   auth,
   asyncHandler(notificationController.sendNotificationToAll),
);

export default router;
