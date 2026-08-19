import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import { adminAuth, adminRoleRequire } from '../../shared/middleware/auth';
import * as superAdminController from './super-admin/controller/superAdminController';
import * as statisticsController from './statistics/controller/statisticsController';
import * as bookingsController from './bookings/controller/bookingsController';
import { AdminRole } from './auth/models/Admin';

const router = express.Router();

router.use(adminAuth, adminRoleRequire(AdminRole.SuperAdmin));

// ──── Управление админами ────────────────────────────────────────────────
router.post('/admins', asyncHandler(superAdminController.createAdmin));
router.get('/admins', asyncHandler(superAdminController.getAllAdmins));
router.get(
   '/admins/:adminId',
   asyncHandler(superAdminController.getAdminDetails),
);
router.delete(
   '/admins/:adminId',
   asyncHandler(superAdminController.deleteAdmin),
);
router.put(
   '/admins/:adminId/permissions',
   asyncHandler(superAdminController.updateAdminPermissions),
);
router.get(
   '/admins/:adminId/logs',
   asyncHandler(superAdminController.getAdminLogs),
);

// ──── Глобальный лог админ-действий ─────────────────────────────────────
router.get('/logs', asyncHandler(superAdminController.getGlobalLogs));

// ──── Статистика (новые модули) ─────────────────────────────────────────
// Legacy: /stats — оставляем для совместимости (overview)
router.get('/stats', asyncHandler(statisticsController.getOverview));
router.get('/stats/overview', asyncHandler(statisticsController.getOverview));
router.get('/stats/users', asyncHandler(statisticsController.getUsers));
router.get('/stats/trips', asyncHandler(statisticsController.getTrips));
router.get('/stats/wallet', asyncHandler(statisticsController.getWallet));
router.get(
   '/stats/active-trips',
   asyncHandler(statisticsController.getActiveTrips),
);
router.get('/stats/reports', asyncHandler(statisticsController.getReports));
router.get('/stats/admins', asyncHandler(statisticsController.getAdmins));
router.get('/stats/bookings', asyncHandler(statisticsController.getBookings));
router.get('/stats/searches', asyncHandler(statisticsController.getSearches));
router.get('/stats/dau-mau', asyncHandler(statisticsController.getDauMau));
router.get(
   '/stats/engagement',
   asyncHandler(statisticsController.getEngagement),
);

// ──── Существующие dashboard-страницы (списки) ──────────────────────────
router.get(
   '/active-trips',
   asyncHandler(superAdminController.getActiveTripsPage),
);
router.get(
   '/finished-trips',
   asyncHandler(superAdminController.getFinishedTripsPage),
);
router.get('/wallets', asyncHandler(superAdminController.getWalletsPage));
router.get('/guests', asyncHandler(superAdminController.getGuestsPage));
router.get('/reports', asyncHandler(superAdminController.getReportsPage));
router.get('/bookings', asyncHandler(bookingsController.getAllBookings));
router.get(
   '/bookings/:bookingId',
   asyncHandler(bookingsController.getBookingById),
);
router.get('/searches', asyncHandler(superAdminController.getSearchesPage));

router.get('/me', asyncHandler(superAdminController.me));

export default router;
