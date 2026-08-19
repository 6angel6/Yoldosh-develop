import express from 'express';

import carRoutes from './car/car';
import authRoutes from './auth/auth';
import chatRoutes from './chat/chat';
import tripRoutes from './trips/trip';
import userRoutes from './user/user';
import blogRoutes from './blog/blog';
import adminRoutes from './admin/admin';
import ratingRoutes from './rating/rating';
import walletRoutes from './payment/wallet';
import bookingRoutes from './booking/booking';
import parcelRoutes from './parcel/parcel';
import paymentRoutes from './payment/payment';
import superAdminRoutes from './admin/superAdmin';
import notificationRoutes from './chat/notification';
import referralRoutes from './promocode/referral';
import publicTripsRoutes from './trips/publicTrips';
import bannerRoutes from './banner/banner';
import internalTripsRoutes from './trips/internalTrips';
import internalDriverChatRoutes from './chat/internalDriverChat';
import internalCallRoutes from './call/internalCall';
import userCardsRoutes from './payment/userCard';

const router = express.Router();

router.use('/car', carRoutes);
router.use('/auth', authRoutes);
router.use('/blog', blogRoutes);
router.use('/chat', chatRoutes);
router.use('/user', userRoutes);
router.use('/trip', tripRoutes);
router.use('/admin', adminRoutes);
router.use('/wallet', walletRoutes);
router.use('/ratings', ratingRoutes);
router.use('/booking', bookingRoutes);
router.use('/parcel', parcelRoutes);
router.use('/payment', paymentRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/notification', notificationRoutes);
router.use('/referral', referralRoutes);
router.use('/public/trips', publicTripsRoutes);
router.use('/banners', bannerRoutes);
router.use('/internal/trips', internalTripsRoutes);
router.use('/internal/driver-chat', internalDriverChatRoutes);
router.use('/internal/call', internalCallRoutes);
router.use('/card', userCardsRoutes);

export default router;
