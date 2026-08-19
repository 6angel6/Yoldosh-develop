import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import { auth, authForSearch, roleRequire } from '../../shared/middleware/auth';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';
import * as tripController from './controller/tripController';
import * as reportController from '../user/controller/reportController';
import { checkBan } from '../../shared/middleware/checkBan';
import { SessionTracker } from '../../shared/middleware/sessionTracker';
import { UserRole } from '../user/models/User';

const router = express.Router();

router.get('/my-activity', auth, asyncHandler(tripController.getMyActivity));

router.get(
   '/search',
   authForSearch,
   SessionTracker,
   trackTestUserActions('search.create'),
   asyncHandler(tripController.searchTrips),
);

router.get('/req-price', asyncHandler(tripController.priceRecommendation)); // todo: remake by city

router.get('/best', asyncHandler(tripController.getBestTrips));

router.get(
   '/:tripId/bookings',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.getTripBookings),
);

router.get(
   '/:tripId',
   authForSearch,
   trackTestUserActions('trip.view'),
   asyncHandler(tripController.getTripById),
);

router.post(
   '/',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.createTrip), // TODO: CHECK WALLET BALANCE
);

router.patch(
   '/:tripId',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.updateTrip),
);

router.patch(
   '/:tripId/cancel',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.cancelTrip),
);

router.post(
   '/:tripId/start',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.startTrip), // TODO: NAVIAGTION
);

router.post(
   '/:tripId/complete',
   auth,
   roleRequire(UserRole.Driver),
   checkBan,
   asyncHandler(tripController.completeTrip), // TODO: WALLET COMMISION
);

router.post(
   '/:tripId/report',
   auth,
   checkBan,
   asyncHandler(reportController.createTripReport),
);

export default router;
