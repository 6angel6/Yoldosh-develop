import logger from './logger';
import { measureExternalCall } from './appMetrics';
import * as admin from 'firebase-admin';

interface NotificationPayload {
   title: string;
   body: string;
   [key: string]: string;
}

export const sendPushNotification = async (
   fcmToken: string | undefined | null,
   payload: NotificationPayload,
) => {
   if (!fcmToken) {
      logger.warn(
         { payload },
         'Skipping push notification: No FCM token provided for the user.',
      );
      return;
   }

   const { title, body, image, ...additionalData } = payload;

   const notificationId =
      additionalData.bookingId ||
      additionalData.tripId ||
      additionalData.notificationId ||
      additionalData.chatId ||
      String(Date.now());

   const dataPayload: Record<string, string> = {
      id: String(notificationId),
      title,
      body,
      channelId: 'default',
      ...additionalData,
   };

   const message: admin.messaging.Message = {
      token: fcmToken,

      notification: {
         title,
         body,
         // Опциональная картинка уведомления (URL); показывается в самом пуше.
         ...(image ? { imageUrl: image } : {}),
      },

      data: dataPayload,

      android: {
         priority: 'high',
      },

      apns: {
         headers: {
            'apns-priority': '10',
         },
         payload: {
            aps: {
               sound: 'default',
               badge: 1,
            },
         },
      },
   };

   logger.debug(
      {
         fcmToken: fcmToken.substring(0, 20) + '...',
         title,
         notificationId,
         dataKeys: Object.keys(dataPayload),
      },
      'Prep aring to send FCM notification',
   );

   try {
      // firebase-admin не даёт выставить таймаут на send: ограничиваем ожидание
      // сами, иначе зависший FCM держит вызывающий поток (рассылки после commit).
      const response = await measureExternalCall('fcm', () =>
         Promise.race([
            admin.messaging().send(message),
            new Promise<never>((_, reject) =>
               setTimeout(
                  () => reject(new Error('FCM send timed out after 10s')),
                  10_000,
               ).unref(),
            ),
         ]),
      );
      logger.info(
         { messageId: response, fcmToken: fcmToken.substring(0, 20) },
         'Successfully sent push notification.',
      );
   } catch (error) {
      const errorMessage =
         error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any)?.code || 'unknown';

      logger.error(
         {
            err: error,
            errorCode,
            errorMessage,
            fcmToken: fcmToken.substring(0, 20) + '...',
            stack: error instanceof Error ? error.stack : undefined,
         },
         'Failed to send push notification - notification will not be delivered.',
      );
      // Non-critical - don't throw, notification is optional
   }
};
