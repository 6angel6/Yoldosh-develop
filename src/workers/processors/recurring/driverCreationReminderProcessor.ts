import User, { UserRole } from '../../../user/models/User';
import Trip from '../../../trips/models/Trip';
import { Op } from 'sequelize';
import {
   publishNotification,
   NotificationEventSource,
} from '../../queues/notificationQueue';
import { NotificationType } from '../../../chat/models/Notification';
import logger from '../../../../shared/utils/logger';

export const sendDriverCreationReminders = async (): Promise<void> => {
   logger.info('Starting driver creation reminders');

   const reminderDays = [1, 3, 6];

   for (const days of reminderDays) {
      const targetDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const startWindow = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
      const endWindow = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

      const drivers = await User.findAll({
         where: {
            role: UserRole.Driver,
            verified: true,
            createdAt: {
               [Op.between]: [startWindow, endWindow],
            },
         },
         include: [
            {
               model: Trip,
               as: 'drivenTrips',
               required: false,
            },
         ],
      });

      for (const driver of drivers) {
         const trips = (driver as any).trips || [];

         if (trips.length === 0) {
            let translationKey: any;

            if (days === 1) {
               translationKey = 'notification.driver.create_trip_reminder_1d';
            } else if (days === 3) {
               translationKey = 'notification.driver.create_trip_reminder_3d';
            } else {
               translationKey = 'notification.driver.create_trip_reminder_6d';
            }

            await publishNotification({
               source: NotificationEventSource.USER,
               eventType: 'driver.create_trip_reminder',
               recipientUserId: driver.id,
               notificationType: NotificationType.GENERAL,
               title: 'Создайте поездку',
               message: 'Создайте вашу первую поездку и начните зарабатывать!',
               timestamp: Date.now(),
               metadata: {
                  tripId: '',
               },
               translationKey,
               titleTranslationKey: 'title.driver.create_trip',
            });

            logger.info(
               { driverId: driver.id, daysSinceRegistration: days },
               'Driver creation reminder sent',
            );
         }
      }
   }

   logger.info('Driver creation reminders completed');
};
