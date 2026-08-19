import { z } from 'zod';
import { Request, Response } from 'express';
import * as statisticsService from '../service/statisticsService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import type { StatsRange } from '../service/statisticsService';

// Не постраничная пагинация, а топ-N дашборда: границы совпадают с потолками
// statisticsService.getActiveTripsStatistics (limit ≤ 200, окно ≤ 168 часов).
// Дефолты (limit 50, upcomingHours 24) остаются в сервисе.
const activeTripsQuerySchema = z.object({
   limit: z.coerce
      .number('Limit must be a number.')
      .int('Limit must be an integer.')
      .min(1, 'Limit must be at least 1.')
      .max(200, 'Limit must be at most 200.')
      .optional(),
   upcomingHours: z.coerce
      .number('upcomingHours must be a number.')
      .int('upcomingHours must be an integer.')
      .min(1, 'upcomingHours must be at least 1.')
      .max(168, 'upcomingHours must be at most 168.')
      .optional(),
});

const parseRange = (req: Request) => {
   const range = (req.query.range as StatsRange) || 'month';
   const from = req.query.from as string | undefined;
   const to = req.query.to as string | undefined;
   return { range, from, to };
};

export const getAdminStatistics = async (req: Request, res: Response) => {
   try {
      if (!req.admin?.id) return apiResponse.unauthorized(res);
      const stats = await statisticsService.getOverviewStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats, 'Overview statistics fetched.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         { operation: 'getAdminStatistics', adminId: req.admin?.id },
         'Failed to fetch statistics. Please try again.',
      );
   }
};

export const getOverview = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getOverviewStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getOverview' });
   }
};

export const getUsers = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getUsersStatistics(parseRange(req));
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getUsersStats' });
   }
};

export const getTrips = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getTripsStatistics(parseRange(req));
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getTripsStats' });
   }
};

export const getWallet = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getWalletStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getWalletStats' });
   }
};

export const getActiveTrips = async (req: Request, res: Response) => {
   try {
      const { limit, upcomingHours } = activeTripsQuerySchema.parse(req.query);
      const stats = await statisticsService.getActiveTripsStatistics({
         limit,
         upcomingHours,
      });
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getActiveTripsStats',
      });
   }
};

export const getReports = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getReportsStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getReportsStats',
      });
   }
};

export const getAdmins = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getAdminsStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getAdminsStats' });
   }
};

export const getBookings = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getBookingsStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getBookingsStats',
      });
   }
};

export const getSearches = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getSearchesStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getSearchesStats',
      });
   }
};

export const getDauMau = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getDauMauSegmentation();
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getDauMauStats' });
   }
};

export const getEngagement = async (req: Request, res: Response) => {
   try {
      const stats = await statisticsService.getEngagementStatistics(
         parseRange(req),
      );
      return apiResponse.success(res, stats);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getEngagementStats',
      });
   }
};
