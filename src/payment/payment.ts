import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import { handlePaynetRequest } from '../../shared/api/paynet/paynetApi';
import { auth, ipakAuth, paynetAuth } from '../../shared/middleware/auth';
import { callBackIpak } from '../../shared/api/ipakYoli/ipakApi';
const router = express.Router();

router.post('/paynet', paynetAuth, asyncHandler(handlePaynetRequest));
router.post('/callbackIpak', ipakAuth, asyncHandler(callBackIpak));

export default router;
