import express from 'express';
import * as userCardController from '../../src/payment/controller/userCardController';
import { auth, roleRequire } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { UserRole } from '../user/models/User';
const router = express.Router();

router.post(
   '/createUserCard',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(userCardController.createUserCard),
);

router.get(
   '/getAllUsersCards',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(userCardController.getAllUsersCards),
);

router.delete(
   '/deleteCard',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(userCardController.deleteCard),
);

export default router;
