import express from 'express';

import { asyncHandler } from '../../shared/config/lib';
import { adminAuth } from '../../shared/middleware/auth';
import { checkPermission } from '../../shared/middleware/permission';
import { AdminPermission } from './auth/models/Admin';
import {
   optimizeImage,
   uploadBlogMedia,
   uploadBannerMediaMemory,
} from '../../shared/middleware/upload';

import * as tripsController from './trips/controller/tripsController';
import * as bookingsController from './bookings/controller/bookingsController';
import * as adminAuthController from './auth/controller/adminAuthController';
import * as applicationController from './applications/controller/applicationController';
import * as statisticsController from './statistics/controller/statisticsController';
import * as reportController from './reports/controller/reportsController';
import * as usersController from './users/controller/usersController';
import * as moderationController from './moderation/controller/moderationController';
import * as promocodeController from '../promocode/controller/promocodeController';
import * as adminBlogController from './blog/controller/adminBlogController';
import * as adminNotificationController from './notifications/controller/adminNotificationController';
import * as adminBannerController from './banner/controller/adminBannerController';

const router = express.Router();

// Auth
router.post('/login', asyncHandler(adminAuthController.login));
router.post('/logout', adminAuth, asyncHandler(adminAuthController.logout));

// Admin Profile & Stats
router.get('/me', adminAuth, asyncHandler(adminAuthController.me));
router.get(
   '/stats',
   adminAuth,
   asyncHandler(statisticsController.getAdminStatistics),
);
router.get(
   '/stats/overview',
   adminAuth,
   asyncHandler(statisticsController.getOverview),
);
router.get(
   '/stats/users',
   adminAuth,
   asyncHandler(statisticsController.getUsers),
);
router.get(
   '/stats/trips',
   adminAuth,
   asyncHandler(statisticsController.getTrips),
);
router.get(
   '/stats/wallet',
   adminAuth,
   asyncHandler(statisticsController.getWallet),
);
router.get(
   '/stats/active-trips',
   adminAuth,
   asyncHandler(statisticsController.getActiveTrips),
);
router.get(
   '/stats/reports',
   adminAuth,
   asyncHandler(statisticsController.getReports),
);
router.get(
   '/stats/admins',
   adminAuth,
   asyncHandler(statisticsController.getAdmins),
);
router.get(
   '/stats/bookings',
   adminAuth,
   asyncHandler(statisticsController.getBookings),
);
router.get(
   '/stats/searches',
   adminAuth,
   asyncHandler(statisticsController.getSearches),
);
router.get(
   '/stats/dau-mau',
   adminAuth,
   asyncHandler(statisticsController.getDauMau),
);
router.get(
   '/stats/engagement',
   adminAuth,
   asyncHandler(statisticsController.getEngagement),
);

// Car Applications
router.patch(
   '/applications/:applicationId/status',
   adminAuth,
   checkPermission(AdminPermission.DRIVER_APPLICATIONS),
   asyncHandler(applicationController.updateApplicationStatus),
);

router.get(
   '/applications',
   adminAuth,
   checkPermission(AdminPermission.DRIVER_APPLICATIONS),
   asyncHandler(applicationController.getAllApplications),
);

router.patch(
   '/applications/:applicationId/data',
   adminAuth,
   checkPermission(AdminPermission.DRIVER_APPLICATIONS),
   asyncHandler(applicationController.updateApplicationFull),
);

// Reports
router.get(
   '/reports',
   adminAuth,
   checkPermission(AdminPermission.REPORTS),
   reportController.getAllReports,
);

router.patch(
   '/reports/:reportId',
   adminAuth,
   checkPermission(AdminPermission.REPORTS),
   reportController.changeReportStatus,
);

router.post(
   '/reports/:reportId/ban',
   adminAuth,
   checkPermission(AdminPermission.REPORTS),
   asyncHandler(reportController.banUserByReport),
);

// Users Management
// /users/banned MUST be declared before /users/:userId — иначе Express
// сматчит «banned» как :userId и роут перестанет работать.
router.get(
   '/users/banned',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.getBannedUsers),
);

router.get(
   '/users/search',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.searchUsers),
);

router.get(
   '/users',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.getAllUsers),
);

router.get(
   '/users/:userId',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.getAdminUserDetails),
);

router.post(
   '/users/:userId/ban',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.banUser),
);

router.patch(
   '/users/:userId/unban',
   adminAuth,
   checkPermission(AdminPermission.USERS),
   asyncHandler(usersController.unbanUser),
);

// Bookings
router.get(
   '/bookings',
   adminAuth,
   checkPermission(AdminPermission.BOOKINGS),
   asyncHandler(bookingsController.getAllBookings),
);

router.get(
   '/bookings/:bookingId',
   adminAuth,
   checkPermission(AdminPermission.BOOKINGS),
   asyncHandler(bookingsController.getBookingById),
);

router.patch(
   '/bookings/:bookingId/status',
   adminAuth,
   checkPermission(AdminPermission.BOOKINGS),
   asyncHandler(tripsController.changeBookingStatusByAdmin),
);

// Trip Management
router.get(
   '/trips',
   adminAuth,
   checkPermission(AdminPermission.TRIPS),
   asyncHandler(tripsController.getAllTrips),
);

router.get(
   '/trips/details/:tripId',
   adminAuth,
   checkPermission(AdminPermission.TRIPS),
   asyncHandler(tripsController.getTripById),
);

router.patch(
   '/trips/:tripId',
   adminAuth,
   checkPermission(AdminPermission.TRIPS),
   asyncHandler(tripsController.editTripByAdmin),
);

router.delete(
   '/trips/:tripId',
   adminAuth,
   checkPermission(AdminPermission.TRIPS),
   asyncHandler(tripsController.deleteTripByAdmin),
);
router.patch(
   '/trips/:tripId/force-status',
   adminAuth,
   checkPermission(AdminPermission.TRIPS),
   asyncHandler(tripsController.changeTripStatusByAdmin),
);

// Global Notifications
router.post(
   '/notifications/global',
   adminAuth,
   checkPermission(AdminPermission.NOTIFICATIONS),
   asyncHandler(adminNotificationController.createGlobalNotification),
);

router.get(
   '/notifications/global',
   adminAuth,
   checkPermission(AdminPermission.NOTIFICATIONS),
   asyncHandler(adminNotificationController.getGlobalNotifications),
);

// Word Moderation
router.get(
   '/moderation/words',
   adminAuth,
   checkPermission(AdminPermission.MODERATION),
   asyncHandler(moderationController.getRestrictedWords),
);

router.post(
   '/moderation/words',
   adminAuth,
   checkPermission(AdminPermission.MODERATION),
   asyncHandler(moderationController.addRestrictedWord),
);

router.delete(
   '/moderation/words/:wordId',
   adminAuth,
   checkPermission(AdminPermission.MODERATION),
   asyncHandler(moderationController.deleteRestrictedWord),
);

// Promocodes Management
router.post(
   '/promocodes',
   adminAuth,
   checkPermission(AdminPermission.PROMOCODES),
   asyncHandler(promocodeController.grantPromoCode),
);

router.get(
   '/user-promocodes',
   adminAuth,
   checkPermission(AdminPermission.PROMOCODES),
   asyncHandler(promocodeController.getUserPromoCodes),
);

router.get(
   '/promocodes',
   adminAuth,
   checkPermission(AdminPermission.PROMOCODES),
   asyncHandler(promocodeController.getGlobalPromoCodes),
);

router.delete(
   '/promocodes/:promoCodeId',
   adminAuth,
   checkPermission(AdminPermission.PROMOCODES),
   asyncHandler(promocodeController.deletePromoCode),
);

// BLOGS
router.get(
   '/blog',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBlogController.getAllBlogs),
);
router.post(
   '/blog',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBlogController.createBlog),
);
router.put(
   '/blog/:id',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBlogController.updateBlog),
);
router.delete(
   '/blog/:id',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBlogController.deleteBlog),
);

// Загрузка картинок
router.post(
   '/blog/upload',
   uploadBlogMedia,
   optimizeImage,
   asyncHandler(adminBlogController.uploadImage),
);

// BANNERS (контент-менеджмент, переиспользуем permission BLOGS)
router.get(
   '/banner',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBannerController.getAllBanners),
);
router.post(
   '/banner',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBannerController.createBanner),
);
router.put(
   '/banner/:id',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBannerController.updateBanner),
);
router.delete(
   '/banner/:id',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   asyncHandler(adminBannerController.deleteBanner),
);
// Загрузка медиа (фото/видео) баннера: multipart-файл в поле "media" → в MinIO.
router.post(
   '/banner/media',
   adminAuth,
   checkPermission(AdminPermission.BLOGS),
   uploadBannerMediaMemory,
   asyncHandler(adminBannerController.uploadMedia),
);

export default router;
