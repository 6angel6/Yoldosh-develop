import Booking, { BookingStatus } from '../../../booking/models/Booking';
import Trip from '../../../trips/models/Trip';
import { Op } from 'sequelize';
import {
   publishNotification,
   NotificationEventSource,
} from '../../queues/notificationQueue';
import { NotificationType } from '../../../chat/models/Notification';
import logger from '../../../../shared/utils/logger';

export const sendBookingDayReminders = async (): Promise<void> => {
   logger.info('Starting booking day reminders');

   const now = new Date();
   const in3Hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
   const in4Hours = new Date(now.getTime() + 4 * 60 * 60 * 1000);

   const upcomingBookings = await Booking.findAll({
      where: {
         status: BookingStatus.CONFIRMED,
      },
      include: [
         {
            model: Trip,
            as: 'trip',
            where: {
               departure_ts: {
                  [Op.between]: [in3Hours, in4Hours],
               },
            },
         },
      ],
   });

   logger.info({ count: upcomingBookings.length }, 'Found upcoming bookings');

   for (const booking of upcomingBookings) {
      try {
         const trip = (booking as any).trip;

         if (!trip) {
            continue;
         }

         const h = trip.departure_ts.getUTCHours().toString().padStart(2, '0');
         const m = trip.departure_ts
            .getUTCMinutes()
            .toString()
            .padStart(2, '0');
         const departureTime = `${h}:${m}`;

         await publishNotification(
            {
               source: NotificationEventSource.BOOKING,
               eventType: 'booking.day_reminder',
               recipientUserId: booking.passengerId,
               notificationType: NotificationType.BOOKING,
               title: 'Поездка сегодня',
               message: `Ваша поездка ${trip.from_city} → ${trip.to_city} сегодня в ${departureTime}. Не опаздывайте!`,
               timestamp: Date.now(),
               metadata: {
                  bookingId: booking.id,
                  tripId: trip.id,
               },
               translationKey: 'notification.booking.day_reminder',
               translationParams: {
                  fromCity: trip.from_city,
                  toCity: trip.to_city,
                  departureTime,
               },
               titleTranslationKey: 'title.booking.day_reminder',
            },
            {
               priority: 1,
            },
         );

         logger.info(
            {
               bookingId: booking.id,
               passengerId: booking.passengerId,
               tripId: trip.id,
               departureTime: trip.departure_ts,
            },
            'Booking day reminder sent',
         );
      } catch (error) {
         logger.error(
            { error, bookingId: booking.id },
            'Failed to send booking reminder',
         );
      }
   }

   logger.info('Booking day reminders completed');
};
