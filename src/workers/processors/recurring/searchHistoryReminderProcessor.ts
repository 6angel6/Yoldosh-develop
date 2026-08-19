import Search from '../../../user/models/Search';
import Trip, { TripStatus } from '../../../trips/models/Trip';
import { Op } from 'sequelize';
import {
   publishNotification,
   NotificationEventSource,
} from '../../queues/notificationQueue';
import { NotificationType } from '../../../chat/models/Notification';
import logger from '../../../../shared/utils/logger';

export const sendSearchHistoryReminders = async (): Promise<void> => {
   logger.info('Starting search history reminders');

   const recentSearches = await Search.findAll({
      where: {
         created_at: {
            [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000),
         },
         userId: {
            [Op.ne]: null, // Только для зарегистрированных юзеров
         },
      },
   });

   logger.info({ count: recentSearches.length }, 'Found recent searches');

   for (const search of recentSearches) {
      try {
         const newTrips = await Trip.findAll({
            where: {
               from_city: search.from_city,
               to_city: search.to_city,
               status: TripStatus.Created,
               created_at: {
                  [Op.gte]: search.created_at,
               },
               departure_ts: {
                  [Op.gte]: new Date(),
               },
            },
            limit: 10,
         });

         if (newTrips.length > 0) {
            await publishNotification({
               source: NotificationEventSource.TRIP,
               eventType: 'search.new_trips',
               recipientUserId: search.userId!,
               notificationType: NotificationType.TRIPS,
               title: 'Новые поездки',
               message: `Найдено ${newTrips.length} новых поездок ${search.from_city} → ${search.to_city}`,
               timestamp: Date.now(),
               metadata: {
                  tripId: newTrips[0].id,
                  tripCount: newTrips.length,
               },
               translationKey: 'notification.search.new_trips',
               translationParams: {
                  fromCity: search.from_city || '',
                  toCity: search.to_city || '',
                  tripCount: newTrips.length,
               },
               titleTranslationKey: 'title.search.new_trips',
            });

            logger.info(
               {
                  userId: search.userId,
                  fromCity: search.from_city,
                  toCity: search.to_city,
                  tripCount: newTrips.length,
               },
               'Search history reminder sent',
            );
         }
      } catch (error) {
         logger.error(
            { error, searchId: search.id },
            'Failed to process search reminder',
         );
      }
   }

   logger.info('Search history reminders completed');
};
