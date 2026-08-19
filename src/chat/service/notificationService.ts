import Notification, { NotificationType } from '../models/Notification';
import * as userRepository from '../../user/repository/userRepository';
import * as notificationRepository from '../repository/notificationRepository';
import { sendPushNotification } from '../../../shared/utils/fcmService';
import { tAsync, getUserLanguage } from '../../../shared/i18n/i18nService';
import type { TranslationKey } from '../../../shared/i18n/types';
import logger from '../../../shared/utils/logger';
import { InternalServerError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';

interface CreateNotificationData {
   userId: string;
   title?: string;
   message?: string;
   translationKey?: TranslationKey;
   translationParams?: Record<string, string | number>;
   titleKey?: TranslationKey;
   type: NotificationType;
   metadata?: Record<string, any>;
   image?: string | null;
}

export const createNotification = async (
   data: CreateNotificationData,
): Promise<Notification | null> => {
   const user = await userRepository.findUserForNotification(data.userId);

   if (!user) {
      return null;
   }

   if (
      user.notificationPreferences &&
      user.notificationPreferences[
         data.type as keyof typeof user.notificationPreferences
      ] === false
   ) {
      logger.debug(
         { userId: user.id, type: data.type },
         '[SKIP] Notification disabled by user preference',
      );
      return null;
   }

   logger.debug(
      {
         userId: user.id,
         type: data.type,
         fcmToken: user.fcmToken
            ? `${user.fcmToken.substring(0, 20)}...`
            : null,
         hasFcmToken: !!user.fcmToken,
      },
      'User loaded for notification',
   );

   const userLanguage = getUserLanguage(user.preferredLanguage);

   let localizedMessage: string;
   let localizedTitle: string;

   if (data.translationKey) {
      localizedMessage = await tAsync(
         data.translationKey,
         userLanguage,
         data.translationParams,
      );

      if (data.titleKey) {
         localizedTitle = await tAsync(data.titleKey, userLanguage);
      } else {
         const titleKeyGuess = data.translationKey.replace(
            'notification.',
            'title.',
         ) as TranslationKey;
         localizedTitle = await tAsync(titleKeyGuess, userLanguage);
      }
   } else if (data.message) {
      logger.warn(
         {
            userId: data.userId,
            type: data.type,
         },
         'Using deprecated message field. Please migrate to translationKey.',
      );
      localizedMessage = data.message;
      localizedTitle =
         data.title || (await tAsync('general.welcome', userLanguage));
   } else {
      throw new InternalServerError(
         'Either message or translationKey must be provided',
         ErrorCode.INTERNAL_UNEXPECTED,
      );
   }

   const notification = await notificationRepository.createNotification({
      userId: data.userId,
      title: localizedTitle,
      message: localizedMessage,
      type: data.type,
      image: data.image ?? null,
   });

   if (user.fcmToken) {
      const notificationPayload = {
         title: localizedTitle,
         body: localizedMessage,
         type: data.type,
         notificationId: notification.id,
         ...(data.image ? { image: data.image } : {}),
         ...Object.fromEntries(
            Object.entries(data.metadata || {})
               .filter(([, v]) => v != null && v !== '')
               .map(([k, v]) => [k, String(v)]),
         ),
      };

      logger.debug(
         {
            userId: user.id,
            fcmToken: `${user.fcmToken.substring(0, 20)}...`,
            notificationId: notification.id,
         },
         'Sending FCM push notification',
      );

      await sendPushNotification(user.fcmToken, notificationPayload);
   }

   return notification;
};

export const getNotificationsForUser = async (
   userId: string,
   limit: number,
): Promise<Notification[]> => {
   const notifications = await notificationRepository.findNotificationsByUserId(
      userId,
      limit,
   );

   await notificationRepository.markAllReadByUser(userId);

   return notifications;
};

export const markNotificationAsRead = async (
   notificationId: string,
   userId: string,
): Promise<Notification | null> => {
   const notification =
      await notificationRepository.findNotificationByIdAndUserId(
         notificationId,
         userId,
      );

   if (notification) {
      notification.isRead = true;
      await notificationRepository.saveNotification(notification);
   }

   return notification;
};

export const sendNotificationToAllUsers = async (
   translationKey: TranslationKey,
   type: NotificationType,
   translationParams?: Record<string, string | number>,
   image?: string | null,
) => {
   const users = await userRepository.findAllUsersForBroadcast();
   for (const user of users) {
      await createNotification({
         userId: user.id,
         translationKey,
         translationParams,
         type,
         image,
      });
   }
};
