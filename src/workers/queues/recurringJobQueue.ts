import { Queue } from 'bullmq';
import { bullMQConnection } from '../../../shared/config/bullmq';
import logger from '../../../shared/utils/logger';

export enum RecurringJobType {
   SEARCH_HISTORY_REMINDERS = 'search_history_reminders',
   DRIVER_CREATION_REMINDERS = 'driver_creation_reminders',
   BOOKING_DAY_REMINDERS = 'booking_day_reminders',
   INACTIVE_USER_REMINDERS = 'inactive_user_reminders',
   NEGATIVE_BALANCE_REMINDERS = 'negative_balance_reminders',
   CLEANUP_OLD_DATA = 'cleanup_old_data',
   PREDICTOR_MAINTENANCE = 'predictor_maintenance', // Trip Predictor: долив горизонта + expire
   PREDICTOR_EXPIRE_SWEEP = 'predictor_expire_sweep', // Trip Predictor: снятие неподтверждённых прогнозов
   EXPIRE_STALE_TRIPS = 'expire_stale_trips', // Просроченные CREATED/IN_PROGRESS трипы
   TEST_USER_NOTIFICATIONS = 'test_user_notifications',
}

export interface RecurringJobPayload {
   type: RecurringJobType;
   metadata?: Record<string, any>;
}

export const recurringJobQueue = new Queue<RecurringJobPayload>(
   'recurring-jobs',
   {
      connection: bullMQConnection,
      defaultJobOptions: {
         attempts: 2,
         backoff: {
            type: 'exponential',
            delay: 5000,
         },
         removeOnComplete: {
            age: 24 * 3600,
            count: 100,
         },
         removeOnFail: {
            age: 7 * 24 * 3600,
         },
      },
   },
);

let queueAvailable = true;
let lastQueueError = 0;

recurringJobQueue.on('error', (err) => {
   const now = Date.now();
   const isRedisError =
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED') ||
      (err as any).code === 'ECONNRESET';

   if (isRedisError) {
      if (queueAvailable || now - lastQueueError > 30000) {
         logger.warn(
            { queue: 'recurring-jobs' },
            'Recurring jobs queue: Redis disconnected',
         );
         lastQueueError = now;
      }
   } else {
      logger.error(
         { err, queue: 'recurring-jobs' },
         'Recurring jobs queue error',
      );
   }
   queueAvailable = false;
});

logger.info({ queue: 'recurring-jobs' }, 'Recurring jobs queue initialized');

export const initRecurringJobs = async (): Promise<void> => {
   logger.info('Initializing recurring jobs');

   if (!queueAvailable) {
      logger.warn('Recurring jobs queue unavailable - skipping initialization');
      return;
   }

   try {
      const oldRepeatableJobs = await (
         recurringJobQueue as any
      ).getRepeatableJobs();
      if (oldRepeatableJobs.length > 0) {
         logger.info(
            { count: oldRepeatableJobs.length },
            'Migration: removing legacy repeatable jobs (BullMQ v4) from Redis',
         );
         await Promise.all(
            oldRepeatableJobs.map((job: any) =>
               (recurringJobQueue as any).removeRepeatableByKey(job.key),
            ),
         );
      }

      // 1. Каждые 2 часа: search history reminders
      await recurringJobQueue.upsertJobScheduler(
         'search-history-reminders',
         { pattern: '0 */2 * * *' },
         {
            name: RecurringJobType.SEARCH_HISTORY_REMINDERS,
            data: { type: RecurringJobType.SEARCH_HISTORY_REMINDERS },
         },
      );

      // 2. 10:00 ежедневно: driver creation reminders
      await recurringJobQueue.upsertJobScheduler(
         'driver-creation-reminders',
         { pattern: '0 10 * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.DRIVER_CREATION_REMINDERS,
            data: { type: RecurringJobType.DRIVER_CREATION_REMINDERS },
         },
      );

      // 3. Каждый час: booking day reminders
      await recurringJobQueue.upsertJobScheduler(
         'booking-day-reminders',
         { pattern: '0 * * * *' },
         {
            name: RecurringJobType.BOOKING_DAY_REMINDERS,
            data: { type: RecurringJobType.BOOKING_DAY_REMINDERS },
         },
      );

      // 4. 12:00 ежедневно: inactive user reminders
      await recurringJobQueue.upsertJobScheduler(
         'inactive-user-reminders',
         { pattern: '0 12 * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.INACTIVE_USER_REMINDERS,
            data: { type: RecurringJobType.INACTIVE_USER_REMINDERS },
         },
      );

      // 5. 10:00 ежедневно: negative balance reminders
      await recurringJobQueue.upsertJobScheduler(
         'negative-balance-reminders',
         { pattern: '0 10 * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.NEGATIVE_BALANCE_REMINDERS,
            data: { type: RecurringJobType.NEGATIVE_BALANCE_REMINDERS },
         },
      );

      // 6. 03:00 ежедневно: cleanup old data
      await recurringJobQueue.upsertJobScheduler(
         'cleanup-old-data',
         { pattern: '0 3 * * *' },
         {
            name: RecurringJobType.CLEANUP_OLD_DATA,
            data: { type: RecurringJobType.CLEANUP_OLD_DATA },
         },
      );

      // 7. 03:00 ежедневно (Ташкент): Trip Predictor — долив горизонта прогнозов
      //    активных паттернов + удаление протухших прогнозов.
      await recurringJobQueue.upsertJobScheduler(
         'predictor-maintenance',
         { pattern: '0 3 * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.PREDICTOR_MAINTENANCE,
            data: { type: RecurringJobType.PREDICTOR_MAINTENANCE },
         },
      );

      // 8. Ежечасно (:05): Trip Predictor — снятие прогнозов, которые водитель
      //    не подтвердил к моменту выезда (брони на них отменяются, пассажир
      //    получает пуш). Суточного прохода мало: бронь на рейс, уехавший в
      //    18:00, висела бы «в ожидании» до 03:00 следующих суток.
      await recurringJobQueue.upsertJobScheduler(
         'predictor-expire-sweep',
         { pattern: '5 * * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.PREDICTOR_EXPIRE_SWEEP,
            data: { type: RecurringJobType.PREDICTOR_EXPIRE_SWEEP },
         },
      );

      // 9. Ежечасно (:25): просроченные трипы. Водители из Telegram не нажимают
      //    «Начать»/«Завершить», поэтому рейсы суточной давности висят в CREATED.
      //    CREATED → CANCELED, IN_PROGRESS → COMPLETED.
      await recurringJobQueue.upsertJobScheduler(
         'expire-stale-trips',
         { pattern: '25 * * * *', tz: 'Asia/Tashkent' },
         {
            name: RecurringJobType.EXPIRE_STALE_TRIPS,
            data: { type: RecurringJobType.EXPIRE_STALE_TRIPS },
         },
      );

      await recurringJobQueue.upsertJobScheduler(
         'test-user-notifications',
         { pattern: '0 * * * *' },
         {
            name: RecurringJobType.TEST_USER_NOTIFICATIONS,
            data: { type: RecurringJobType.TEST_USER_NOTIFICATIONS },
         },
      );

      logger.info(
         'All recurring job schedulers registered (idempotent upsert)',
      );
   } catch (error) {
      logger.error(
         { error },
         'Failed to initialize recurring jobs - Redis may be unavailable',
      );
      queueAvailable = false;
   }
};
