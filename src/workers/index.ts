import notificationWorker, {
   closeNotificationWorker,
} from './notificationWorker';
import recurringJobWorker, {
   closeRecurringJobWorker,
} from './recurringJobWorker';
import { initRecurringJobs } from './queues/recurringJobQueue';
import logger from '../../shared/utils/logger';

export const startAllWorkers = async (): Promise<void> => {
   logger.info('Starting all workers');

   try {
      await initRecurringJobs();

      logger.info('All workers started successfully');
      logger.info(
         {
            notification: { concurrency: 20, queue: 'notifications' },
            recurring: { concurrency: 1, queue: 'recurring-jobs' },
         },
         'Worker configuration',
      );
   } catch (error) {
      logger.error(
         { error },
         'Failed to start workers - continuing without background jobs',
      );
      // Не падаем, просто логируем - приложение может работать без воркеров
   }
};

const shutdown = async (signal: string): Promise<void> => {
   logger.info({ signal }, 'Shutting down workers');

   try {
      await Promise.all([closeNotificationWorker(), closeRecurringJobWorker()]);
      logger.info('All workers closed successfully');
   } catch (error) {
      logger.error({ error }, 'Error during worker shutdown');
      throw error;
   }
};

export const shutdownAllWorkers = (): Promise<void> => shutdown('graceful');

export { notificationWorker, recurringJobWorker };
