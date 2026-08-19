import { Request, Response, NextFunction } from 'express';
import User from '../../src/user/models/User';
import {
   publishNotification,
   NotificationEventSource,
} from '../../src/workers/queues/notificationQueue';
import { NotificationType } from '../../src/chat/models/Notification';
import logger from '../utils/logger';

const TEST_PHONE_NUMBER = '+998000000000';

// Чтобы не спамить одинаковыми уведомлениями
const lastEventTimestamps = new Map<string, number>();
const EVENT_COOLDOWN = 60000; // 1 минута между одинаковыми событиями

export const trackTestUserActions = (actionType: string) => {
   return async (req: Request, res: Response, next: NextFunction) => {
      try {
         // Получаем userId из req.user (предполагается что auth middleware уже сработал)
         const userId = (req as any).user?.id;

         if (!userId) {
            return next();
         }

         // Получаем полную информацию о пользователе включая phoneNumber
         // (req.user содержит только id и role)
         // ВАЖНО: явно указываем fcm_token, т.к. defaultScope его исключает
         const user = await User.findByPk(userId, {
            attributes: ['id', 'phoneNumber', ['fcm_token', 'fcmToken']],
         });

         if (!user || user.phoneNumber !== TEST_PHONE_NUMBER) {
            return next();
         }

         logger.debug(
            {
               userId: user.id,
               phoneNumber: user.phoneNumber,
               fcmToken: user.fcmToken
                  ? `${user.fcmToken.substring(0, 20)}...`
                  : null,
               hasFcmToken: !!user.fcmToken,
            },
            'Test user detected in request',
         );

         const eventKey = `${userId}-${actionType}`;
         const lastEventTime = lastEventTimestamps.get(eventKey) || 0;
         const now = Date.now();

         if (now - lastEventTime < EVENT_COOLDOWN) {
            return next();
         }

         lastEventTimestamps.set(eventKey, now);

         const actionMessages: Record<
            string,
            { title: string; message: string; emoji: string }
         > = {
            'profile.view': {
               emoji: '👤',
               title: 'Вход в профиль',
               message: 'Вы зашли в свой профиль',
            },
            'search.create': {
               emoji: '🔍',
               title: 'Выполнен поиск',
               message: 'Вы выполнили поиск поездки',
            },
            'trip.view': {
               emoji: '🚗',
               title: 'Просмотр поездки',
               message: 'Вы посмотрели информацию о поездке',
            },
            'booking.create': {
               emoji: '🎫',
               title: 'Создание бронирования',
               message: 'Вы создали новое бронирование',
            },
            'wallet.view': {
               emoji: '💰',
               title: 'Просмотр кошелька',
               message: 'Вы открыли свой кошелек',
            },
            'chat.open': {
               emoji: '💬',
               title: 'Открытие чата',
               message: 'Вы открыли чат',
            },
         };

         const actionInfo =
            actionMessages[actionType] || actionMessages['profile.view'];

         const currentTime = new Date().toLocaleString('ru-RU', {
            timeZone: 'Asia/Tashkent',
         });

         const tripId = req.params?.tripId;

         // Отправляем уведомление асинхронно (не блокируем запрос)
         publishNotification({
            source: NotificationEventSource.USER,
            eventType: `test.${actionType}`,
            recipientUserId: userId,
            notificationType: NotificationType.SYSTEM,
            title: `${actionInfo.emoji} ${actionInfo.title}`,
            message: `${actionInfo.message}. Время: ${currentTime}`,
            timestamp: now,
            metadata: {
               userId: userId,
               ...(tripId && { tripId }),
            },
            translationKey: 'notification.test.action' as any,
            translationParams: {
               action: actionInfo.message,
               time: currentTime,
            },
            titleTranslationKey: 'title.test.action' as any,
         }).catch((error) => {
            // Не прерываем выполнение запроса если уведомление не отправилось
            logger.error(
               { error, userId, actionType },
               'Failed to send test user action notification',
            );
         });

         logger.info(
            {
               userId,
               phoneNumber: TEST_PHONE_NUMBER,
               actionType,
               path: req.path,
               method: req.method,
            },
            'Test user action tracked',
         );
      } catch (error) {
         // Логируем ошибку но не прерываем выполнение
         logger.error(
            { error, actionType },
            'Error in test user tracking middleware',
         );
      }

      next();
   };
};

/**
 * Очистка старых timestamps (вызывать периодически или при restart сервера)
 */
export const cleanupTestUserTracking = () => {
   const now = Date.now();
   const entriesToDelete: string[] = [];

   lastEventTimestamps.forEach((timestamp, key) => {
      if (now - timestamp > 24 * 60 * 60 * 1000) {
         entriesToDelete.push(key);
      }
   });

   entriesToDelete.forEach((key) => lastEventTimestamps.delete(key));

   if (entriesToDelete.length > 0) {
      logger.debug(
         { cleaned: entriesToDelete.length },
         'Cleaned up ol d test user tracking data',
      );
   }
};
