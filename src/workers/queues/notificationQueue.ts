import { Queue } from 'bullmq';
import {
   bullMQConnection,
   defaultJobOptions,
} from '../../../shared/config/bullmq';
import logger from '../../../shared/utils/logger';
import { NotificationType } from '../../chat/models/Notification';
import { tAsync } from '../../../shared/i18n/i18nService';
import type { TranslationKey } from '../../../shared/i18n/types';
import { UserLanguage } from '../../user/models/User';

export enum NotificationEventSource {
   BOOKING = 'booking',
   TRIP = 'trip',
   PAYMENT = 'payment',
   CHAT = 'chat',
   USER = 'user',
   ADMIN = 'admin',
   PARCEL = 'parcel',
}

export interface BaseNotificationPayload {
   source: NotificationEventSource;
   eventType: string; // booking.created, trip.started, payment.completed
   recipientUserId: string;
   notificationType: NotificationType;
   title: string;
   message: string;
   timestamp: number;
   metadata?: Record<string, any>;
   translationKey?: TranslationKey;
   translationParams?: Record<string, string | number>;
   titleTranslationKey?: TranslationKey;
}

export interface BookingNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.BOOKING;
   metadata: {
      bookingId: string;
      tripId: string;
      seatCount?: number;
      totalPrice?: string;
   };
}

export interface ParcelNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.PARCEL;
   metadata: {
      parcelId: string;
      tripId: string;
      price?: string;
   };
}

export interface WalletNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.PAYMENT;
   metadata: {
      userId: string;
      walletId: string;
      balance?: number;
      newBalance?: number;
   };
}

export interface RatingNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.TRIP;
   metadata: {
      ratingById: string; // User who is rating
      ratedUserId: string; // User who is being rated
      tripId: string;
   };
}

export interface TripNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.TRIP;
   metadata: {
      tripId: string;
      status?: string;
      driverId?: string;
      passengerId?: string;
      hoursBeforeDeparture?: number; // For reminders
      bookingId?: string; // For passenger reminders
      tripCount?: number; // For daily digest
      tripIds?: string[]; // For daily digest
   };
}

export interface PaymentNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.PAYMENT;
   metadata: {
      paymentId: string;
      amount: number;
      status: string;
   };
}

export interface UserNotificationPayload extends BaseNotificationPayload {
   source: NotificationEventSource.USER;
   metadata: {
      userId?: string;
      tripId?: string;
   };
}

export type NotificationPayload =
   | BookingNotificationPayload
   | TripNotificationPayload
   | RatingNotificationPayload
   | PaymentNotificationPayload
   | WalletNotificationPayload
   | UserNotificationPayload
   | ParcelNotificationPayload;

export interface PublishNotificationOptions<TMetadata> {
   recipientId: string;
   eventType: string;
   metadata: TMetadata;
   translation: {
      key: TranslationKey;
      params?: Record<string, string | number>;
      titleKey?: TranslationKey;
   };
}

let queueAvailable = true;
let lastQueueError = 0;

export const notificationQueue = new Queue<NotificationPayload>(
   'notifications',
   {
      connection: bullMQConnection,
      defaultJobOptions: {
         ...defaultJobOptions,
         // attempts: 1 — намеренно НЕ повторяем уведомления при ошибке.
         // Повторная попытка = повторный FCM push = дублирование у пользователя.
         // Если FCM недоступен или DB временно упала — лучше пропустить, чем спамить.
         attempts: 1,
         priority: 2, // Medium priority по умолчанию
      },
   },
);

notificationQueue.on('error', (err) => {
   const now = Date.now();
   const isRedisError =
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED') ||
      (err as any).code === 'ECONNRESET';

   if (isRedisError) {
      // Логируем только первую ошибку или раз в 30 секунд
      if (queueAvailable || now - lastQueueError > 30000) {
         logger.warn(
            { queue: 'notifications' },
            'Notification queue: Redis disconnected',
         );
         lastQueueError = now;
      }
   } else {
      logger.error({ err, queue: 'notifications' }, 'Notification queue error');
   }
   queueAvailable = false;
});

logger.info({ queue: 'notifications' }, 'Notification queue initialized');

export const publishNotification = async (
   payload: NotificationPayload,
   options?: {
      priority?: number;
      delay?: number;
   },
) => {
   if (!queueAvailable) {
      logger.warn(
         { userId: payload.recipientUserId, event: payload.eventType },
         'Queue unavailable, notification skipped',
      );
      return null;
   }

   try {
      logger.debug(
         {
            userId: payload.recipientUserId,
            source: payload.source,
            event: payload.eventType,
            timestamp: Date.now(),
         },
         'Publishing notification to queue',
      );

      const job = await notificationQueue.add(
         `${payload.source}.${payload.eventType}`,
         payload,
         {
            jobId: `${payload.source}-${payload.eventType}-${payload.recipientUserId}-${Date.now()}`,
            priority: options?.priority || 2,
            delay: options?.delay || 0,
         },
      );

      // Если успешно добавили job, значит Redis работает
      if (!queueAvailable) {
         logger.info('Notification queue is available again');
         queueAvailable = true;
      }

      if (process.env.NODE_ENV === 'development' || options?.delay) {
         logger.debug(
            {
               userId: payload.recipientUserId,
               source: payload.source,
               event: payload.eventType,
               delay: options?.delay,
            },
            '[QUEUE] Notification queued',
         );
      }

      return job;
   } catch (error) {
      queueAvailable = false;
      logger.error(
         {
            error,
            payload,
         },
         'Failed to publish notification - Redis may be unavailable',
      );
      // Не бросаем ошибку - приложение может работать без уведомлений
      return null;
   }
};

export const publishWalletNotification = async (
   options: PublishNotificationOptions<WalletNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.wallet.negative_balance', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.PAYMENT,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.PAYMENT,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};

export const publishBookingNotification = async (
   options: PublishNotificationOptions<BookingNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.booking.confirmed', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.BOOKING,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.BOOKING,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};

// В приложении посылки сохраняются как notificationType BOOKING — отдельного
// значения в DB-enum notifications.type нет (source различает их в очереди).
export const publishParcelNotification = async (
   options: PublishNotificationOptions<ParcelNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.parcel.new_request', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.PARCEL,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.BOOKING,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};

export const publishRatingNotification = async (
   options: PublishNotificationOptions<RatingNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.rating', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.TRIP,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.RATING,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};

export const publishTripNotification = async (
   options: PublishNotificationOptions<TripNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.trip.started', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.TRIP,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.TRIPS,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};

export const publishPaymentNotification = async (
   options: PublishNotificationOptions<PaymentNotificationPayload['metadata']>,
) => {
   const {
      recipientId,
      eventType,
      metadata,
      translation: { key, params, titleKey },
   } = options;

   const fallbackMessage = await tAsync(
      key as TranslationKey,
      UserLanguage.Russian,
      params,
   );
   const fallbackTitle = titleKey
      ? await tAsync(titleKey as TranslationKey, UserLanguage.Russian)
      : await tAsync('title.payment.wallet', UserLanguage.Russian);

   return publishNotification({
      source: NotificationEventSource.PAYMENT,
      eventType,
      recipientUserId: recipientId,
      notificationType: NotificationType.PAYMENT,
      title: fallbackTitle,
      message: fallbackMessage,
      timestamp: Date.now(),
      metadata,
      translationKey: key as TranslationKey,
      translationParams: params,
      titleTranslationKey: titleKey as TranslationKey,
   });
};
