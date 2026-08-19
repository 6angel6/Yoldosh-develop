import express from 'express';
import { auth, roleRequire } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { checkBan } from '../../shared/middleware/checkBan';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';
import * as parcelController from './controller/parcelController';
import { UserRole } from '../user/models/User';

const router = express.Router();

// Мои посылки (отправитель)
router.get('/my', auth, asyncHandler(parcelController.getMyParcels));

// Посылки трипа (водитель); ?status=PENDING|CONFIRMED|...
router.get(
   '/trip/:tripId',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(parcelController.getTripParcels),
);

router.get('/:parcelId', auth, asyncHandler(parcelController.getParcelById));

// Заявка на доставку посылки (любой авторизованный пользователь)
router.post(
   '/',
   auth,
   checkBan,
   trackTestUserActions('parcel.create'),
   asyncHandler(parcelController.createParcel),
);

// Отправитель отменяет свою посылку
router.patch(
   '/:parcelId/cancel',
   auth,
   checkBan,
   asyncHandler(parcelController.cancelParcel),
);

// Действия водителя
router.post(
   '/:parcelId/confirm',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(parcelController.confirm),
);
router.post(
   '/:parcelId/reject',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(parcelController.reject),
);
router.post(
   '/:parcelId/pickup',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(parcelController.pickup),
);
router.post(
   '/:parcelId/deliver',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(parcelController.deliver),
);

export default router;
