import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '../../shared/config/bullmq';
import {
   RecurringJobPayload,
   RecurringJobType,
} from './queues/recurringJobQueue';
import { sendSearchHistoryReminders } from './processors/recurring/searchHistoryReminderProcessor';
import { sendDriverCreationReminders } from './processors/recurring/driverCreationReminderProcessor';
import { sendBookingDayReminders } from './processors/recurring/bookingDayReminderProcessor';
import { sendInactiveUserReminders } from './processors/recurring/inactiveUserReminderProcessor';
import { sendNegativeBalanceReminders } from './processors/recurring/negativeBalanceReminderProcessor';
import { cleanupOldData } from './processors/recurring/cleanupProcessor';
import {
   runPredictorMaintenance,
   runPredictorExpireSweep,
} from './processors/recurring/predictorMaintenanceProcessor';
import { expireStaleTrips } from './processors/recurring/staleTripProcessor';
import { sendTestUserNotifications } from './processors/recurring/testUserNotificationProcessor';
import logger from '../../shared/utils/logger';

const recurringJobWorker = new Worker<RecurringJobPayload>(
   'recurring-jobs',
   async (job: Job<RecurringJobPayload>) => {
      logger.info(
         {
            jobId: job.id,
            type: job.data.type,
         },
         'Processing recurring job',
      );

      const startTime = Date.now();

      try {
         switch (job.data.type) {
            case RecurringJobType.SEARCH_HISTORY_REMINDERS:
               await sendSearchHistoryReminders();
               break;

            case RecurringJobType.DRIVER_CREATION_REMINDERS:
               await sendDriverCreationReminders();
               break;

            case RecurringJobType.BOOKING_DAY_REMINDERS:
               await sendBookingDayReminders();
               break;

            case RecurringJobType.INACTIVE_USER_REMINDERS:
               await sendInactiveUserReminders();
               break;

            case RecurringJobType.NEGATIVE_BALANCE_REMINDERS:
               await sendNegativeBalanceReminders();
               break;

            case RecurringJobType.CLEANUP_OLD_DATA:
               await cleanupOldData();
               break;

            case RecurringJobType.PREDICTOR_MAINTENANCE:
               await runPredictorMaintenance();
               break;

            case RecurringJobType.PREDICTOR_EXPIRE_SWEEP:
               await runPredictorExpireSweep();
               break;

            case RecurringJobType.EXPIRE_STALE_TRIPS:
               await expireStaleTrips();
               break;

            case RecurringJobType.TEST_USER_NOTIFICATIONS:
               logger.info('Executing TEST_USER_NOTIFICATIONS job');
               await sendTestUserNotifications();
               break;

            default:
               logger.warn(
                  { type: job.data.type },
                  'Unknown recurring job type',
               );
         }

         const duration = Date.now() - startTime;
         logger.info(
            { jobId: job.id, type: job.data.type, duration },
            'Recurring job completed successfully',
         );
      } catch (error) {
         logger.error(
            { jobId: job.id, type: job.data.type, error },
            'Recurring job failed',
         );
         throw error;
      }
   },
   {
      connection: bullMQConnection,
      concurrency: 1, // ВАЖНО: только 1 concurrent job для recurring tasks
      limiter: {
         max: 10,
         duration: 60000,
      },
      autorun: false, // Запускаем вручную
   },
);

const lastErrorTime = 0;
let consecutiveErrors = 0;

recurringJobWorker.on('completed', (job) => {
   if (consecutiveErrors > 0) {
      logger.info('Recurring job worker: Redis connection restored');
      consecutiveErrors = 0;
   }

   logger.info(
      {
         jobId: job.id,
         type: job.data?.type,
         duration: Date.now() - job.timestamp,
      },
      'Recurring job completed',
   );
});

recurringJobWorker.on('failed', (job, err) => {
   logger.error(
      {
         jobId: job?.id,
         type: job?.data?.type,
         error: err.message,
      },
      'Recurring job failed',
   );
});

recurringJobWorker.on('error', (err) => {
   const isRedisError =
      err.message.includes("Stream isn't writeable") ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED');

   if (isRedisError) {
      consecutiveErrors++;
      if (consecutiveErrors === 1) {
         logger.warn(
            'Recurring job worker: Redis connection lost, waiting for reconnection...',
         );
      } else if (consecutiveErrors % 10 === 0) {
         logger.debug(
            `Recurring job worker: still waiting for Redis (${consecutiveErrors} errors)`,
         );
      }
   } else {
      logger.error({ error: err.message }, 'Recurring job worker error');
   }
});

// void: fire-and-forget на старте, отказ обработан внутри try/catch
void (async () => {
   try {
      await recurringJobWorker.run();
      logger.info('Recurring job worker started successfully');
   } catch (error) {
      logger.error(
         { error },
         'Failed to start recurring job worker - will retry when Redis is available',
      );
   }
})();

export const closeRecurringJobWorker = async (): Promise<void> => {
   logger.info('Closing recurring job worker...');
   await recurringJobWorker.close();
};

logger.info(
   { concurrency: 1, queue: 'recurring-jobs' },
   'Recurring job worker initialized',
);

export default recurringJobWorker;
