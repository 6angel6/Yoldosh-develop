import User, { UserRole } from '../../../user/models/User';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import { getIO } from '../../../../shared/config/socket';
import Notification, {
   NotificationType,
   NotificationAudience,
} from '../../../chat/models/Notification';
import * as adminLogService from '../../log/service/adminLogService';
import * as notificationRepository from '../../../chat/repository/notificationRepository';
import { getMessaging } from 'firebase-admin/messaging';
import logger from '../../../../shared/utils/logger';

export const createGlobalNotification = async (
   adminId: string,
   title: string,
   content: string,
   type: NotificationType,
   targetAudience: NotificationAudience,
   image: string | null = null,
) => {
   const whereClause: any = {};
   if (targetAudience === NotificationAudience.DRIVERS) {
      whereClause.role = UserRole.Driver;
   } else if (targetAudience === NotificationAudience.PASSENGERS) {
      whereClause.role = UserRole.Passenger;
   }

   const totalUsers = await User.count({ where: whereClause });

   const BATCH_SIZE = 500;
   let offset = 0;
   const io = getIO();

   while (true) {
      const users = await User.findAll({
         attributes: [
            'id',
            ['fcm_token', 'fcmToken'],
            'notificationPreferences',
         ],
         where: whereClause,
         limit: BATCH_SIZE,
         offset: offset,
         raw: true,
      });

      if (users.length === 0) break;

      const validUsers = users.filter((u: any) => {
         const prefs =
            typeof u.notificationPreferences === 'string'
               ? JSON.parse(u.notificationPreferences)
               : u.notificationPreferences;

         return prefs?.[type] !== false;
      });

      if (validUsers.length > 0) {
         const notificationsData = validUsers.map((u: any) => ({
            userId: u.id,
            title: title,
            message: content,
            type,
            isGlobal: true,
            targetAudience,
            image,
            createdAt: new Date(),
            updatedAt: new Date(),
         }));

         const createdNotifications = await Notification.bulkCreate(
            notificationsData,
            {
               returning: true,
            },
         );

         const fcmTokens: string[] = [];

         validUsers.forEach((u: any) => {
            const userNotification = createdNotifications.find(
               (n) => n.userId === u.id,
            );

            if (userNotification) {
               io.to(u.id).emit('new_notification', userNotification);
            }

            if (
               u.fcmToken &&
               u.fcmToken !== 'fcmToken' &&
               u.fcmToken.length > 10
            ) {
               fcmTokens.push(u.fcmToken);
            }
         });

         if (fcmTokens.length > 0) {
            const payload = {
               title: title,
               body: content,
               type: type,
               notificationId: createdNotifications[0]?.id || '',
               image: image ?? undefined,
            };

            await sendMulticastNotification(fcmTokens, payload);
         }
      }

      offset += BATCH_SIZE;
   }

   await adminLogService.logAction(
      adminId,
      AdminAction.CREATE_GLOBAL_NOTIFICATION,
      undefined,
      undefined,
      AdminLogEntityType.NOTIFICATION,
      {
         snapshot: {
            label: title,
            subLabel: content.substring(0, 80),
            meta: { audience: targetAudience, type, recipients: totalUsers },
         },
         metadata: {
            title,
            content,
            type,
            targetAudience,
            recipients: totalUsers,
         },
      },
   );

   return {
      message: 'Global notification sent successfully.',
      receivedAmount: totalUsers,
   };
};

export const getGlobalNotifications = async (options: {
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   startDate?: string;
   endDate?: string;
}) => {
   const { page, limit, sortBy, sortOrder, search, startDate, endDate } =
      options;
   const offset = (page - 1) * limit;

   const { count, rows } = await notificationRepository.findGlobalNotifications(
      {
         limit,
         offset,
         sortBy,
         sortOrder,
         search,
         startDate,
         endDate,
      },
   );

   const notificationsWithCounts = await Promise.all(
      rows.map(async (notification: any) => {
         const whereClause: any = {};
         if (notification.targetAudience === NotificationAudience.DRIVERS) {
            whereClause.role = UserRole.Driver;
         } else if (
            notification.targetAudience === NotificationAudience.PASSENGERS
         ) {
            whereClause.role = UserRole.Passenger;
         }
         const receivedAmount = await User.count({ where: whereClause });
         return { ...notification, receivedAmount };
      }),
   );

   return {
      notifications: notificationsWithCounts,
      total: count,
      currentPage: page,
   };
};

export const sendMulticastNotification = async (
   tokens: string[],
   payload: any,
) => {
   if (!tokens.length) return;

   const message = {
      notification: {
         title: payload.title,
         body: payload.body,
         // Опциональная картинка (URL) — показывается в самом пуше.
         ...(payload.image ? { imageUrl: payload.image } : {}),
      },
      data: {
         type: payload.type,
         notificationId: payload.notificationId || '',
      },
      android: {
         priority: 'high' as const,
         notification: {
            channelId: 'default',
            defaultSound: true,
            defaultVibrateTimings: true,
         },
      },
      apns: {
         headers: {
            'apns-priority': '10',
         },
         payload: {
            aps: {
               alert: {
                  title: payload.title,
                  body: payload.body,
               },
               sound: 'default',
            },
         },
      },
      tokens: tokens,
   };

   try {
      const response = await getMessaging().sendEachForMulticast(message);
      if (response.failureCount > 0) {
         logger.warn(
            { failureCount: response.failureCount, total: tokens.length },
            'Some multicast notifications failed to send',
         );
      }
   } catch (error) {
      logger.error({ err: error }, 'Error sending multicast notification');
   }
};
