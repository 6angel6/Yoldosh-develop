import { Queue, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import logger from '../utils/logger';
import dotenv from 'dotenv';
import { URL } from 'url';
import database from './database';

dotenv.config();

const QUEUE_NAME = 'didox-checks';
export const PAYMENT_QUEUE_NAME = 'paymnet-checks';

const redisUrl =
   process.env.REDIS_QUEUE_URL || 'redis://yoldosh-redis-queue:6379';

let connectionOptions: ConnectionOptions;

try {
   const url = new URL(redisUrl);
   connectionOptions = {
      host: url.hostname || 'localhost',
      port: parseInt(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      tls:
         url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      family: 4,
   };
} catch (e) {
   logger.warn(
      { redisUrl, err: e },
      'Could not parse REDIS_URL, defaulting to localhost:6379 for BullMQ',
   );
   connectionOptions = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
   };
}

export const paymentConnection = connectionOptions;

export const paymentQueue = new Queue(PAYMENT_QUEUE_NAME, {
   connection: paymentConnection,
   defaultJobOptions: {
      attempts: 30,
      backoff: {
         type: 'exponential',
         delay: 5000,
      },
      removeOnComplete: { age: 10000 },
      removeOnFail: { age: 24 * 3600 },
   },
});

paymentQueue.on('error', (err) => {
   // logger.error({ err }, `BullMQ Queue [${PAYMENT_QUEUE_NAME}] error`);
});

export const didoxConnection = connectionOptions;

export const didoxQueue = new Queue(QUEUE_NAME, {
   connection: didoxConnection,
   defaultJobOptions: {
      attempts: 10,
      backoff: {
         type: 'exponential',
         delay: 180000, // 3 min
      },
      removeOnComplete: { age: 10000 },
      removeOnFail: { age: 24 * 3600 },
   },
});

export const didoxQueueName = QUEUE_NAME;

didoxQueue.on('error', (err) => {
   // logger.error({ err }, `BullMQ Queue [${QUEUE_NAME}] error`);
});

logger.info(`BullMQ Queue [${QUEUE_NAME}] initialized.`);
