import logger from '../../../../shared/utils/logger';
import { z } from 'zod';
import { Request, Response } from 'express';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import { AdminPermission, AdminRole } from '../../auth/models/Admin';
import { clearCache } from '../../../../shared/config/redis';
import { formatZodError } from '../../../../shared/utils/zodErrors';
import { createAdminSchema } from '../../../../shared/utils/schemas';
import * as superAdminService from '../service/superAdminService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import * as adminLogService from '../../log/service/adminLogService';
import * as superAdminRepository from '../repository/superAdminRepository';
import * as statisticsService from '../../statistics/service/statisticsService';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { adminIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const createAdmin = async (req: Request, res: Response) => {
   try {
      const validatedData = createAdminSchema.parse(req.body);
      const superAdminId = req.admin.id;
      const newAdmin = await superAdminService.createAdmin(
         superAdminId,
         validatedData,
      );
      return apiResponse.success(
         res,
         newAdmin,
         'Admin created successfully.',
         201,
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         return apiResponse.badRequest(res, formatZodError(error));
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'createAdmin',
            superAdminId: req.admin?.id,
         },
         'Failed to create admin. Please try again.',
      );
   }
};

export const deleteAdmin = async (req: Request, res: Response) => {
   try {
      const { adminId } = adminIdParamsSchema.parse(req.params);
      const superAdminId = req.admin.id;
      await superAdminService.deleteAdmin(superAdminId, adminId);
      return apiResponse.success(res, null, 'Admin deleted successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteAdmin',
            superAdminId: req.admin?.id,
            adminId: req.params.adminId,
         },
         'Failed to delete admin. Please try again.',
      );
   }
};

export const getAllAdmins = async (req: Request, res: Response) => {
   try {
      const admins = await superAdminService.getAllAdmins();
      return apiResponse.success(res, admins, 'Admins fetched successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllAdmins',
            superAdminId: req.admin?.id,
         },
         'Failed to fetch admins. Please try again.',
      );
   }
};

export const updateAdminPermissions = async (req: Request, res: Response) => {
   try {
      const superAdminId = req.admin.id;
      const { adminId } = adminIdParamsSchema.parse(req.params);
      const incomingPermissions = req.body ?? {};

      const adminToUpdate = await superAdminRepository.findAdminById(adminId);
      if (!adminToUpdate) {
         return apiResponse.notFound(res, 'Admin not found.');
      }
      if (adminToUpdate.role === AdminRole.SuperAdmin) {
         return apiResponse.badRequest(
            res,
            'Cannot change permissions of a SuperAdmin.',
         );
      }

      const validKeys = Object.values(AdminPermission) as string[];

      const normalized: { [k: string]: boolean } = {};

      for (const rawKey of Object.keys(incomingPermissions || {})) {
         const value = incomingPermissions[rawKey];

         const matched = validKeys.find(
            (k) => k.toLowerCase() === String(rawKey).toLowerCase(),
         );
         if (!matched) {
            continue;
         }

         let boolVal: boolean | null = null;
         if (typeof value === 'boolean') {
            boolVal = value;
         } else if (typeof value === 'string') {
            if (value.toLowerCase() === 'true') boolVal = true;
            else if (value.toLowerCase() === 'false') boolVal = false;
         } else if (typeof value === 'number') {
            boolVal = value === 1;
         }

         if (boolVal === null) {
            continue;
         }
         normalized[matched] = boolVal;
      }

      const merged = {
         ...(adminToUpdate.permissions || {}),
         ...normalized,
      };

      adminToUpdate.permissions = merged;
      await adminToUpdate.save();

      await adminLogService.logAction(
         superAdminId,
         AdminAction.UPDATE_ADMIN_PERMISSIONS,
         undefined,
         adminToUpdate.id,
         AdminLogEntityType.ADMIN,
         {
            snapshot: {
               label:
                  [adminToUpdate.firstName, adminToUpdate.lastName]
                     .filter(Boolean)
                     .join(' ') || adminToUpdate.email,
               subLabel: adminToUpdate.email,
               meta: { role: adminToUpdate.role },
            },
            metadata: { permissions: merged, changed: normalized },
         },
      );

      const { password, ...adminResponse } = adminToUpdate.get({ plain: true });
      return apiResponse.success(
         res,
         adminResponse,
         'Permissions updated successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateAdminPermissions',
            superAdminId: req.admin?.id,
            adminId: req.params.adminId,
         },
         'Failed to update permissions. Please try again.',
      );
   }
};

export const getAdminLogs = async (req: Request, res: Response) => {
   try {
      const { adminId } = adminIdParamsSchema.parse(req.params);
      const { page = 1, limit = 20 } = paginationQuerySchema.parse(req.query);
      const {
         sortBy = 'timestamp',
         sortOrder = 'DESC',
         search,
         startDate,
         endDate,
         category,
         action,
         entityType,
         entityId,
      } = req.query as { [key: string]: string };

      const logs = await superAdminService.getAdminLogs(adminId, {
         page,
         limit,
         sortBy,
         sortOrder,
         search,
         startDate,
         endDate,
         category,
         action,
         entityType,
         entityId,
      });
      return apiResponse.success(res, logs, 'Admin logs fetched successfully.');
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getAdminLogs',
         adminId: req.params.adminId,
      });
   }
};

export const getGlobalLogs = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 20 } = paginationQuerySchema.parse(req.query);
      const {
         sortBy = 'timestamp',
         sortOrder = 'DESC',
         search,
         startDate,
         endDate,
         category,
         action,
         entityType,
         entityId,
         adminIds,
      } = req.query as { [key: string]: string };

      const logs = await superAdminService.getGlobalLogs({
         page,
         limit,
         sortBy,
         sortOrder,
         search,
         startDate,
         endDate,
         category,
         action,
         entityType,
         entityId,
         adminIds: adminIds
            ? adminIds
                 .split(',')
                 .map((s) => s.trim())
                 .filter(Boolean)
            : undefined,
      });
      return apiResponse.success(res, logs, 'Global admin logs fetched.');
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getGlobalLogs' });
   }
};

export const getAdminDetails = async (req: Request, res: Response) => {
   try {
      const { adminId } = adminIdParamsSchema.parse(req.params);
      const { from, to } = req.query as { [key: string]: string };
      const range =
         from || to
            ? {
                 from: from ? new Date(from) : undefined,
                 to: to ? new Date(to) : undefined,
              }
            : undefined;

      const data = await superAdminService.getAdminDetails(adminId, range);
      return apiResponse.success(res, data, 'Admin details fetched.');
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getAdminDetails',
         adminId: req.params.adminId,
      });
   }
};

export const me = async (req: Request, res: Response) => {
   try {
      const superAdminId = req.admin.id;
      const superAdmin = await superAdminService.me(superAdminId);
      return apiResponse.success(res, superAdmin);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'superAdminMe',
            superAdminId: req.admin?.id,
         },
         'Failed to fetch super admin profile. Please try again.',
      );
   }
};

export const getStatistics = async (req: Request, res: Response) => {
   try {
      const { range = 'month' } = req.query;

      const stats = await statisticsService.getAdvancedDashboardStatistics(
         range as 'day' | 'week' | 'month',
      );
      return apiResponse.success(
         res,
         stats,
         'Statistics fetched successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getStatistics',
            superAdminId: req.admin?.id,
         },
         'Failed to fetch statistics.',
      );
   }
};

export const getActiveTripsPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         search,
         range,
         from,
         to,
         startDate,
         endDate,
         sortBy = 'departure_ts',
         sortOrder = 'DESC',
      } = req.query as any;
      const result = await superAdminService.getActiveTrips({
         limit,
         offset: (page - 1) * limit,
         sortBy,
         sortOrder,
         search,
         range,
         from,
         to,
         startDate,
         endDate,
      });
      return apiResponse.success(res, {
         trips: result.rows,
         total: result.count,
         totalPages: Math.ceil(result.count / limit),
         currentPage: page,
         // KPI-блок для шапки страницы /super-admin/active-trips — те же числа,
         // что в /super-admin/stats/active-trips, но без detailed-списка.
         snapshot: result.snapshot,
      });
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getActiveTripsPage',
      });
   }
};

export const getFinishedTripsPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         search,
         range,
         from,
         to,
         startDate,
         endDate,
         sortBy = 'trip_end_ts',
         sortOrder = 'DESC',
      } = req.query as any;
      const result = await superAdminService.getFinishedTrips({
         limit,
         offset: (page - 1) * limit,
         sortBy,
         sortOrder,
         search,
         range,
         from,
         to,
         startDate,
         endDate,
      });
      return apiResponse.success(res, {
         trips: result.rows,
         total: result.count,
         totalPages: Math.ceil(result.count / limit),
         currentPage: page,
      });
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getFinishedTripsPage',
      });
   }
};

export const getWalletsPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         search,
         range,
         from,
         to,
         startDate,
         endDate,
         sortBy = 'createdAt',
         sortOrder = 'DESC',
      } = req.query as any;
      const result = await superAdminService.getWalletTopUps({
         page,
         limit,
         sortBy,
         sortOrder,
         search,
         range,
         from,
         to,
         startDate,
         endDate,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getWalletsPage' });
   }
};

export const getGuestsPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const result = await superAdminService.getGuests({
         page,
         limit,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getGuestsPage' });
   }
};

export const getSearchesPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 20 } = paginationQuerySchema.parse(req.query);
      const {
         search,
         from,
         to,
         range,
         startDate,
         endDate,
         sortBy = 'count',
         sortOrder = 'DESC',
      } = req.query as any;

      const result = await superAdminService.getSearchesPage({
         page,
         limit,
         search,
         range,
         from,
         to,
         startDate,
         endDate,
         sortBy,
         sortOrder,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getSearchesPage',
      });
   }
};

export const getReportsPage = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         search,
         status,
         range,
         from,
         to,
         startDate,
         endDate,
         sortBy = 'createdAt',
         sortOrder = 'DESC',
      } = req.query as any;
      const result = await superAdminService.getReports({
         page,
         limit,
         search,
         sortBy,
         sortOrder,
         range,
         from,
         to,
         startDate,
         endDate,
      });
      return apiResponse.success(res, {
         reports: result.rows,
         total: result.count,
         totalPages: result.totalPages,
         currentPage: result.currentPage,
      });
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getReportsPage' });
   }
};
