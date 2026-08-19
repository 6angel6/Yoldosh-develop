import logger from '../../../../shared/utils/logger';
import { z } from 'zod';
import { Request, Response } from 'express';
import { banUserSchema } from '../../../../shared/utils/schemas';
import { formatZodError } from '../../../../shared/utils/zodErrors';
import * as usersService from '../service/usersService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import * as userService from '../../../user/service/userService';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { UserRole } from '../../../user/models/User';
import { adminUserIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const unbanUser = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { userId } = adminUserIdParamsSchema.parse(req.params);
      const result = await usersService.unbanUser(adminId, userId);
      return apiResponse.success(res, result, 'User has been unbanned.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'unbanUser',
            adminId: req.admin?.id,
            userId: req.params.userId,
         },
         'Failed to unban user. Please try again.',
      );
   }
};

export const getBannedUsers = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const {
         sortBy = 'updatedAt',
         sortOrder = 'DESC',
         range,
         from,
         to,
         startDate,
         endDate,
      } = req.query as { [key: string]: string };

      const pagination = paginationQuerySchema.safeParse(req.query);
      if (!pagination.success) {
         return apiResponse.badRequest(res, 'Invalid pagination parameters.');
      }
      const { page: pageNum = 1, limit: limitNum = 10 } = pagination.data;

      const result = await usersService.getBannedUsers({
         page: pageNum,
         limit: limitNum,
         sortBy: sortBy || 'updatedAt',
         sortOrder: sortOrder || 'DESC',
         range,
         from,
         to,
         startDate,
         endDate,
      });

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getBannedUsers',
            adminId: req.admin?.id,
         },
         'Failed to fetch banned users. Please try again.',
      );
   }
};

export const getAllUsers = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const {
         sortBy = 'createdAt',
         sortOrder = 'DESC',
         search,
         role,
         hasPromoCode,
         registrationSource,
         verified,
         banned,
         range,
         from,
         to,
         startDate,
         endDate,
      } = req.query as { [key: string]: string };

      const pagination = paginationQuerySchema.safeParse(req.query);
      if (!pagination.success) {
         return apiResponse.badRequest(res, 'Invalid pagination parameters.');
      }
      const { page: pageNum = 1, limit: limitNum = 10 } = pagination.data;

      const users = await userService.getAllUsers({
         page: pageNum,
         limit: limitNum,
         sortBy: sortBy || 'createdAt',
         sortOrder: sortOrder || 'DESC',
         search,
         role: role as UserRole | undefined,
         hasPromoCode: hasPromoCode as 'true' | 'false' | undefined,
         registrationSource,
         verified: verified as 'true' | 'false' | undefined,
         banned: banned as 'true' | 'false' | undefined,
         range,
         from,
         to,
         startDate,
         endDate,
      });
      return apiResponse.success(res, users);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllUsers',
            adminId: req.admin?.id,
         },
         'Failed to fetch users. Please try again.',
      );
   }
};

export const searchUsers = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { query } = req.query;
      if (!query || typeof query !== 'string' || query.trim().length < 1) {
         return apiResponse.badRequest(
            res,
            'Search query (min 1 char) is required.',
         );
      }
      const users = await usersService.searchUsers(query, adminId);
      return apiResponse.success(res, users);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'searchUsers',
            adminId: req.admin?.id,
            query: req.query.query,
         },
         'Failed to search users. Please try again.',
      );
   }
};

export const getAdminUserDetails = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { userId } = adminUserIdParamsSchema.parse(req.params);
      const userDetails = await usersService.getUserDetails(userId, adminId);
      return apiResponse.success(res, userDetails);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAdminUserDetails',
            adminId: req.admin?.id,
            userId: req.params.userId,
         },
         'Failed to fetch user details. Please try again.',
      );
   }
};

export const banUser = async (req: Request, res: Response) => {
   try {
      const { userId } = adminUserIdParamsSchema.parse(req.params);
      const adminId = req.admin.id;
      const validatedData = banUserSchema.parse(req.body);
      const { reason, durationInDays } = validatedData;

      const result = await usersService.banUser(
         adminId,
         userId,
         reason,
         durationInDays,
      );
      return apiResponse.success(
         res,
         result,
         'User banned successfully by admin.',
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         return apiResponse.badRequest(
            res,
            formatZodError(error),
            'Validation error.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'banUser',
            adminId: req.admin?.id,
            userId: req.params.userId,
         },
         'Failed to ban user. Please try again.',
      );
   }
};

export const getUserById = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { userId } = adminUserIdParamsSchema.parse(req.params);
      const user = await usersService.getUserById(userId);

      if (!user) {
         return apiResponse.notFound(res, 'User not found');
      }
      return apiResponse.success(res, user);
   } catch (error) {
      logger.error(
         { err: error, userId: req.params.userId },
         'Admin failed to get user details',
      );
      return apiResponse.error(res, 'Internal Server Error', 500);
   }
};
