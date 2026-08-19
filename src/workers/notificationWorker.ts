import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '../../shared/config/bullmq';
import { NotificationPayload } from './queues/notificationQueue';
import { processNotification } from './processors/notification/notificationProcessor';
import logger from '../../shared/utils/logger';

const notificationWorker = new Worker<NotificationPayload>(
   'notifications',
   async (job: Job<NotificationPayload>) => {
      await processNotification(job);
   },
   {
      connection: bullMQConnection,
      concurrency: 20, // Больше concurrency для уведомлений
      limiter: {
         max: 100, // 100 уведомлений
         duration: 1000, // за секунду (защита от спама)
      },
      removeOnComplete: {
         count: 500,
         age: 12 * 3600,
      },
      removeOnFail: {
         count: 2000,
         age: 3 * 24 * 3600,
      },
      autorun: false, // Запускаем вручную после проверки Redis
   },
);

notificationWorker.on('completed', (job) => {
   if (consecutiveErrors > 0) {
      logger.info('Notification worker: Redis connection restored');
      consecutiveErrors = 0;
   }

   logger.info(
      {
         userId: job.data?.recipientUserId,
         source: job.data?.source,
         event: job.data?.eventType,
         type: job.data?.notificationType,
         duration: `${Date.now() - job.timestamp}ms`,
      },
      '[OK] Notification sent',
   );
});

notificationWorker.on('failed', (job, err) => {
   logger.error(
      {
         jobId: job?.id,
         source: job?.data?.source,
         eventType: job?.data?.eventType,
         attemptsMade: job?.attemptsMade,
         error: err.message,
      },
      'Notification failed',
   );
});

let lastErrorTime = 0;
let consecutiveErrors = 0;

notificationWorker.on('error', (err) => {
   const now = Date.now();
   const isRedisError =
      err.message.includes("Stream isn't writeable") ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED');

   if (isRedisError) {
      consecutiveErrors++;
      // Логируем только первую ошибку и каждую 10-ю
      if (consecutiveErrors === 1) {
         logger.warn(
            'Notification worker: Redis connection lost, waiting for reconnection...',
         );
      } else if (consecutiveErrors % 10 === 0) {
         logger.debug(
            `Notification worker: still waiting for Redis (${consecutiveErrors} errors)`,
         );
      }
   } else {
      logger.error({ error: err.message }, 'Notification worker error');
   }

   lastErrorTime = now;
});

// void: fire-and-forget на старте, отказ обработан внутри try/catch
void (async () => {
   try {
      await notificationWorker.run();
      logger.info('Notification worker started successfully');
   } catch (error) {
      logger.error(
         { error },
         'Failed to start notification worker - will retry when Redis is available',
      );
   }
})();

export async function closeNotificationWorker() {
   logger.info('Closing notification worker...');
   await notificationWorker.close();
}

logger.info(
   {
      concurrency: 20,
      queue: 'notifications',
   },
   'Notification worker started',
);

export default notificationWorker;
