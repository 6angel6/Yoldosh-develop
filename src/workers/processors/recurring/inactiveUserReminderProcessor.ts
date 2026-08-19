import User from '../../../user/models/User';
import { Op } from 'sequelize';
import {
   publishNotification,
   NotificationEventSource,
} from '../../queues/notificationQueue';
import { NotificationType } from '../../../chat/models/Notification';
import logger from '../../../../shared/utils/logger';

export const sendInactiveUserReminders = async (): Promise<void> => {
   logger.info('Starting inactive user reminders');

   const inactiveDays = [5, 10, 20];

   for (const days of inactiveDays) {
      // Найти пользователей которые не заходили N дней назад
      const targetDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const startWindow = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
      const endWindow = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

      const inactiveUsers = await User.findAll({
         where: {
            updatedAt: {
               [Op.between]: [startWindow, endWindow],
            },
            verified: true,
            isBanned: false,
         },
      });

      for (const user of inactiveUsers) {
         let translationKey: any;

         if (days === 5) {
            translationKey = 'notification.user.inactive_5d';
         } else if (days === 10) {
            translationKey = 'notification.user.inactive_10d';
         } else {
            translationKey = 'notification.user.inactive_20d';
         }

         await publishNotification({
            source: NotificationEventSource.USER,
            eventType: 'user.inactive_reminder',
            recipientUserId: user.id,
            notificationType: NotificationType.GENERAL,
            title: 'Вернитесь в Yo’ldosh',
            message: 'Скучаем по вам! Посмотрите новые поездки.',
            timestamp: Date.now(),
            metadata: {
               tripId: '', // Not applicable
            },
            translationKey,
            titleTranslationKey: 'title.user.comeback',
         });

         logger.info(
            { userId: user.id, daysInactive: days },
            'Inactive user reminder sent',
         );
      }

      logger.info(
         { days, count: inactiveUsers.length },
         'Processed inactive users',
      );
   }

   logger.info('Inactive user reminders completed');
};
