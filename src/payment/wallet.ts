import express from 'express';
import { auth, roleRequire } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';
import * as walletController from './controller/walletController';
import { UserRole } from '../user/models/User';

const router = express.Router();

router.get(
   '/me',
   auth,
   trackTestUserActions('wallet.view'),
   roleRequire(UserRole.Driver),
   asyncHandler(walletController.getMyWallet),
);

router.get(
   '/me/transactions',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(walletController.getAllTransactionsByWallet),
);

router.post(
   '/deposit',
   auth,
   roleRequire(UserRole.Driver),
   asyncHandler(walletController.depositToWallet),
);

export default router;
