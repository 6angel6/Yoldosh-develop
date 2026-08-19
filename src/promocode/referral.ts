import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import * as referralController from '../promocode/controller/referralController';
import { auth } from '../../shared/middleware/auth';
import { matchInstallFingerPrint } from '../promocode/controller/referralController';

const router = express.Router();

router.get(
   '/get-ref',
   auth,
   asyncHandler(referralController.getMyReferralCode),
);

router.get('/ref', asyncHandler(referralController.handleReferralLink));

router.post('/match-install', asyncHandler(matchInstallFingerPrint));

export default router;
