import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import * as tripController from './controller/tripController';

const router = express.Router();

router.get('/search', asyncHandler(tripController.searchTripsPublic));

router.get('/popular', asyncHandler(tripController.getPopularTrips));

router.get(
   '/details/:tripId',
   asyncHandler(tripController.getTripDetailsPublic),
);

export default router;
