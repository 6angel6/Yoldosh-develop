import User from '../../../user/models/User';
import {
   publishNotification,
   NotificationEventSource,
} from '../../queues/notificationQueue';
import { NotificationType } from '../../../chat/models/Notification';
import logger from '../../../../shared/utils/logger';

const TEST_PHONE_NUMBER = '+998000000000';

/**
 * Тестовый процессор для проверки работы уведомлений
 * Отправляет уведомление каждые 5 минут тестовому пользователю
 */
export const sendTestUserNotifications = async (): Promise<void> => {
   logger.info('Starting test user notifications');

   // ВАЖНО: явно указываем fcm_token, т.к. defaultScope его исключает
   const testUser = await User.findOne({
      where: {
         phoneNumber: TEST_PHONE_NUMBER,
      },
      attributes: ['id', 'phoneNumber', ['fcm_token', 'fcmToken']],
   });

   if (!testUser) {
      logger.warn(
         { phoneNumber: TEST_PHONE_NUMBER },
         'Test user not found - skipping test notification',
      );
      return;
   }

   logger.info(
      {
         userId: testUser.id,
         phoneNumber: TEST_PHONE_NUMBER,
         fcmToken: testUser.fcmToken
            ? `${testUser.fcmToken.substring(0, 20)}...`
            : null,
         hasFcmToken: !!testUser.fcmToken,
      },
      'Test user loaded for notification',
   );

   if (!testUser.fcmToken) {
      logger.warn(
         { userId: testUser.id, phoneNumber: TEST_PHONE_NUMBER },
         'Test user has no FCM token - notification will be created but not pushed',
      );
   }

   const currentTime = new Date().toLocaleString('ru-RU', {
      timeZone: 'Asia/Tashkent',
   });

   await publishNotification({
      source: NotificationEventSource.USER,
      eventType: 'test.server_heartbeat',
      recipientUserId: testUser.id,
      notificationType: NotificationType.SYSTEM,
      title: '🟢 Сервер работает',
      message: `✅ Система уведомлений активна. Время: ${currentTime}`,
      timestamp: Date.now(),
      metadata: {
         userId: testUser.id,
      },
      translationKey: 'notification.test.server_heartbeat' as any,
      translationParams: {
         time: currentTime,
      },
      titleTranslationKey: 'title.test.server_heartbeat' as any,
   });

   logger.info(
      {
         userId: testUser.id,
         phoneNumber: TEST_PHONE_NUMBER,
         hasFcmToken: !!testUser.fcmToken,
         time: currentTime,
      },
      'Test notification sent to test user',
   );
};
