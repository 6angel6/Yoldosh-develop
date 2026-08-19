import { Request, Response } from 'express';
import * as notificationService from '../service/notificationService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { NotificationType } from '../models/Notification';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { notificationIdParamsSchema } from '../dto/chatParamsDto';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';

export const getMyNotifications = async (req: Request, res: Response) => {
   try {
      const { limit: parsedLimit = 5 } = paginationQuerySchema.parse(req.query);
      // Прежний потолок выборки уведомлений — не более 20 за раз.
      const limit = Math.min(parsedLimit, 20);
      const userId = req.user.id;
      const notifications = await notificationService.getNotificationsForUser(
         userId,
         limit,
      );
      return apiResponse.success(res, { notifications });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyNotifications',
            userId: req.user?.id,
         },
         'Failed to fetch notifications. Please try again.',
      );
   }
};

export const markAsRead = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const { notificationId } = notificationIdParamsSchema.parse(req.params);
      const notification = await notificationService.markNotificationAsRead(
         notificationId,
         userId,
      );

      if (!notification) {
         return apiResponse.notFound(res, 'Notification not found');
      }

      return apiResponse.success(
         res,
         { notification },
         'Notification marked as read',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'markAsRead',
            userId: req.user?.id,
            notificationId: req.params.notificationId,
         },
         'Failed to mark notification as read. Please try again.',
      );
   }
};

export const sendNotificationToAll = async (req: Request, res: Response) => {
   try {
      const { content, type, image } = req.body ?? {};

      if (!content || !type) {
         return apiResponse.badRequest(res, 'Content and type are required.');
      }

      if (!Object.values(NotificationType).includes(type)) {
         return apiResponse.badRequest(res, 'Invalid notification type.');
      }

      if (image !== undefined && image !== null && typeof image !== 'string') {
         return apiResponse.badRequest(res, 'Image must be a string URL.');
      }

      await notificationService.sendNotificationToAllUsers(
         content,
         type,
         undefined,
         image ?? null,
      );

      return apiResponse.success(res, null, 'Notifications sent to all users.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'sendNotificationToAll',
         },
         'Failed to send notifications. Please try again.',
      );
   }
};
