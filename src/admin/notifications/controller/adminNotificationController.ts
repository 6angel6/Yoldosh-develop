import { Request, Response } from 'express';
import { NotificationAudience } from '../../../chat/models/Notification';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import * as adminNotificationService from '../service/adminNotificationService';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const createGlobalNotification = async (req: Request, res: Response) => {
   const adminId = req.user?.id || req.admin?.id;
   const { title, content, type, targetAudience, image } = req.body ?? {};

   if (!title || !content || !type) {
      return apiResponse.badRequest(
         res,
         'Title, content and type are required.',
      );
   }

   if (
      targetAudience &&
      !Object.values(NotificationAudience).includes(targetAudience)
   ) {
      return apiResponse.badRequest(res, 'Invalid target audience.');
   }

   if (image !== undefined && image !== null && typeof image !== 'string') {
      return apiResponse.badRequest(res, 'Image must be a string URL.');
   }

   const result = await adminNotificationService.createGlobalNotification(
      adminId,
      title,
      content,
      type,
      targetAudience || NotificationAudience.ALL,
      image ?? null,
   );
   return apiResponse.success(res, result, 'Global notification sent.');
};

export const getGlobalNotifications = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         sortBy = 'createdAt',
         sortOrder = 'DESC',
         search,
         startDate,
         endDate,
      } = req.query as { [key: string]: string };

      const result = await adminNotificationService.getGlobalNotifications({
         page,
         limit,
         sortBy,
         sortOrder,
         search,
         startDate,
         endDate,
      });

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getGlobalNotifications',
            adminId: req.admin?.id,
         },
         'Failed to fetch notifications. Please try again.',
      );
   }
};
