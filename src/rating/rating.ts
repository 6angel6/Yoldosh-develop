import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import { auth } from '../../shared/middleware/auth';
import * as ratingController from './controller/ratingController';
import { checkBan } from '../../shared/middleware/checkBan';

const router = express.Router();

router.post('/', auth, checkBan, asyncHandler(ratingController.createRating));
router.get('/:userId', asyncHandler(ratingController.getRatingsForUser));

export default router;
