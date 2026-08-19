import express from 'express';
import { auth, roleRequire } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { checkBan } from '../../shared/middleware/checkBan';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';
import * as bookingController from './controller/bookingController';
import { UserRole } from '../user/models/User';

const router = express.Router();

router.get(
   '/:bookingId',
   auth,
   checkBan,
   roleRequire(UserRole.Driver),
   asyncHandler(bookingController.getBookingDetailsByIdForDriver),
);

// Критическая операция - добавляем idempotency для предотвращения двойных бронирований
router.post(
   '/',
   auth,
   checkBan,
   trackTestUserActions('booking.create'),
   asyncHandler(bookingController.createBooking),
);

router.patch(
   '/:bookingId/cancel',
   auth,
   checkBan,
   asyncHandler(bookingController.cancelBooking),
);

router.post(
   '/:bookingId/confirm',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(bookingController.confirm),
);
router.post(
   '/:bookingId/reject',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(bookingController.reject),
);

router.patch(
   '/:bookingId',
   auth,
   checkBan,
   asyncHandler(bookingController.updateBooking),
);

export default router;
