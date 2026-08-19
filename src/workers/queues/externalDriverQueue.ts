import { Queue } from 'bullmq';
import {
   bullMQConnection,
   defaultJobOptions,
} from '../../../shared/config/bullmq';
import logger from '../../../shared/utils/logger';

/**
 * Очередь для уведомлений внешних водителей (импортированных через парсер).
 * Python worker слушает эту очередь и отправляет сообщения через Telegram.
 */

export interface ExternalDriverNotificationPayload {
   event: 'driver.notification';
   data: {
      trip_id: string;
      booking_id: string;
      driver_phone: string;
      driver_name: string;
      from_city: string;
      to_city: string;
      price: number;
      passenger_id: string;
      /**
       * Время выезда (ISO, UTC). Опционально — Python worker может его
       * игнорировать: дата уже вшита в `message`. Нужно, чтобы водитель понял,
       * на какой из своих рейсов пришла бронь.
       */
      departure_ts?: string;
      message: string;
   };
}

export interface ExternalDriverNotificationChatPayload {
   event: 'driver.notification.chat';
   data: {
      trip_id: string;
      driver_phone: string;
      chat_id: string;
      passenger_id: string;
      from_city: string;
      to_city: string;
      price: number;
      message: string;
   };
}

export type ExternalDriverPayload =
   | ExternalDriverNotificationPayload
   | ExternalDriverNotificationChatPayload;
let queueAvailable = true;

export const externalDriverQueue = new Queue<ExternalDriverPayload>(
   'external-driver-notifications',
   {
      connection: bullMQConnection,
      defaultJobOptions: {
         ...defaultJobOptions,
         attempts: 3,
         priority: 1, // High priority — водитель должен получить уведомление быстро
      },
   },
);

externalDriverQueue.on('error', (err) => {
   const isRedisError =
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED') ||
      (err as any).code === 'ECONNRESET';

   if (isRedisError) {
      if (queueAvailable) {
         logger.warn(
            { queue: 'external-driver-notifications' },
            'External driver queue: Redis disconnected',
         );
      }
   } else {
      logger.error(
         { err, queue: 'external-driver-notifications' },
         'External driver queue error',
      );
   }
   queueAvailable = false;
});

logger.info(
   { queue: 'external-driver-notifications' },
   'External driver notification queue initialized',
);

export const publishExternalDriverChatNotification = async (
   payload: ExternalDriverNotificationChatPayload,
): Promise<void> => {
   if (!queueAvailable) {
      logger.warn(
         {
            driverPhone: payload.data.driver_phone,
            tripId: payload.data.trip_id,
         },
         'External driver queue unavailable, chat notification skipped',
      );
      return;
   }

   try {
      await externalDriverQueue.add(payload.event, payload, {
         jobId: `ext-driver-${payload.data.trip_id}-${payload.data.chat_id}-${Date.now()}`,
      });

      if (!queueAvailable) {
         logger.info('External driver queue is available again');
         queueAvailable = true;
      }

      logger.info(
         {
            tripId: payload.data.trip_id,
            chatId: payload.data.chat_id,
            driverPhone: payload.data.driver_phone,
         },
         'External driver notification published',
      );
   } catch (error) {
      queueAvailable = false;
      logger.error(
         { error, payload },
         'Failed to publish external driver notification',
      );
   }
};

export const publishExternalDriverNotification = async (
   payload: ExternalDriverNotificationPayload,
): Promise<void> => {
   if (!queueAvailable) {
      logger.warn(
         {
            driverPhone: payload.data.driver_phone,
            tripId: payload.data.trip_id,
         },
         'External driver queue unavailable, notification skipped',
      );
      return;
   }

   try {
      await externalDriverQueue.add('driver.notification', payload, {
         jobId: `ext-driver-${payload.data.trip_id}-${payload.data.booking_id}-${Date.now()}`,
      });

      if (!queueAvailable) {
         logger.info('External driver queue is available again');
         queueAvailable = true;
      }

      logger.info(
         {
            tripId: payload.data.trip_id,
            bookingId: payload.data.booking_id,
            driverPhone: payload.data.driver_phone,
         },
         'External driver notification published',
      );
   } catch (error) {
      queueAvailable = false;
      logger.error(
         { error, payload },
         'Failed to publish external driver notification',
      );
   }
};
