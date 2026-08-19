import express from 'express';
import * as carController from './controller/carController';
import { auth, roleRequire } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { checkBan } from '../../shared/middleware/checkBan';
import { uploadVerificationDocuments } from '../../shared/middleware/upload';
import { UserRole } from '../user/models/User';

const router = express.Router();

router.post(
   '/',
   auth,
   checkBan,
   uploadVerificationDocuments,
   asyncHandler(carController.createCar),
);

router.patch(
   '/:id/resubmit',
   auth,
   checkBan,
   uploadVerificationDocuments,
   asyncHandler(carController.resubmitCarApplication),
);

router.get(
   '/my-cars',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(carController.getCarsByDriverId),
);

router.patch(
   '/:id',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(carController.updateCar),
);

router.get('/:id', auth, asyncHandler(carController.getCarById));

router.delete(
   '/:id',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(carController.deleteCar),
);

export default router;
