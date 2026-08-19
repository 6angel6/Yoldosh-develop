import { ConnectionOptions } from 'bullmq';
import { URL } from 'url';
import logger from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl =
   process.env.REDIS_QUEUE_URL || 'redis://yoldosh-redis-queue:6379';

export const bullMQConnection: ConnectionOptions = (() => {
   try {
      const url = new URL(redisUrl);
      return {
         host: url.hostname || 'localhost',
         port: parseInt(url.port) || 6379,
         username: url.username || undefined,
         password: url.password || undefined,
         db: 0, // Используем DB 0 для BullMQ
         tls:
            url.protocol === 'rediss:'
               ? { rejectUnauthorized: false }
               : undefined,
         maxRetriesPerRequest: null,
         enableReadyCheck: true,
         enableOfflineQueue: false,
         retryStrategy: (times: number) => {
            if (times > 50) {
               logger.error('BullMQ: Max reconnection attempts reached (50)');
               return null; // Stop after 50 attempts
            }
            // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
            const delay = Math.min(Math.pow(2, times) * 1000, 30000);
            if (times <= 3 || times % 5 === 0) {
               logger.warn(
                  `BullMQ queue: retry ${times}, next attempt in ${delay}ms`,
               );
            }
            return delay;
         },
      };
   } catch (e) {
      logger.warn(
         { redisUrl, err: e },
         'Could not parse REDIS_URL for BullMQ, using localhost:6379',
      );
      return {
         host: 'localhost',
         port: 6379,
         maxRetriesPerRequest: null,
         retryStrategy: (times: number) => Math.min(times * 1000, 30000),
      };
   }
})();

export const defaultJobOptions = {
   attempts: 3,
   backoff: {
      type: 'exponential' as const,
      delay: 2000, // 2s, 4s, 8s
   },
   removeOnComplete: {
      age: 24 * 3600, // Храним успешные job'ы 24 часа
      count: 1000, // Или максимум 1000 штук
   },
   removeOnFail: {
      age: 7 * 24 * 3600, // Храним failed job'ы 7 дней
   },
};

logger.info('BullMQ connection configured');
