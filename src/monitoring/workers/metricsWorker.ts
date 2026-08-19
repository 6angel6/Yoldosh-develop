import { User } from '../../user/models/User';
import logger from '../../../shared/utils/logger';
import { DriverApplication } from '../../car/model/DriverApplication';
import {
   updateUserMetrics,
   updateDriverApplicationMetrics,
   updateDbPoolMetrics,
} from '../service/metricService';
import db from '../../../shared/config/database';
import { Op } from 'sequelize';
import client from 'prom-client';
import { notificationQueue } from '../../workers/queues/notificationQueue';
import { recurringJobQueue } from '../../workers/queues/recurringJobQueue';
import { externalDriverQueue } from '../../workers/queues/externalDriverQueue';
import { paymentQueue } from '../../../shared/config/queue';

const METRICS_UPDATE_INTERVAL = parseInt(
   process.env.METRICS_UPDATE_INTERVAL_MS || '60000',
   10,
);

// Глубина очередей BullMQ: «воркеры не разгребают» видно по росту waiting
const queueDepthGauge = new client.Gauge({
   name: 'bullmq_queue_jobs',
   help: 'BullMQ job counts by queue and state',
   labelNames: ['queue', 'state'],
});

const MONITORED_QUEUES = [
   notificationQueue,
   recurringJobQueue,
   externalDriverQueue,
   paymentQueue,
] as const;

async function updateQueueMetrics(): Promise<void> {
   for (const queue of MONITORED_QUEUES) {
      try {
         const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
         );
         for (const [state, value] of Object.entries(counts)) {
            queueDepthGauge.set({ queue: queue.name, state }, value ?? 0);
         }
      } catch (err) {
         logger.debug({ err, queue: queue.name }, 'Queue metrics unavailable');
      }
   }
}

async function getUserStats(): Promise<{ total: number; active24h: number }> {
   const yesterday = new Date();
   yesterday.setHours(yesterday.getHours() - 24);

   const [total, active24h] = await Promise.all([
      User.count(),
      User.count({
         where: {
            updatedAt: {
               [Op.gte]: yesterday,
            },
         },
      }),
   ]);

   return { total, active24h };
}

async function getDriverApplicationStats(): Promise<{
   pending: number;
   approved: number;
   rejected: number;
}> {
   const [pending, approved, rejected] = await Promise.all([
      DriverApplication.count({ where: { status: 'PENDING' } }),
      DriverApplication.count({ where: { status: 'VERIFIED' } }),
      DriverApplication.count({ where: { status: 'REJECTED' } }),
   ]);

   return { pending, approved, rejected };
}

async function updateAllMetrics() {
   try {
      const [userStats, driverAppStats] = await Promise.all([
         getUserStats(),
         getDriverApplicationStats(),
      ]);

      await updateUserMetrics(async () => userStats);
      await updateDriverApplicationMetrics(async () => driverAppStats);

      const pool = (db as any).connectionManager?.pool;
      if (pool) {
         updateDbPoolMetrics(pool);
      }

      await updateQueueMetrics();
   } catch (error) {
      logger.error({ err: error }, 'MetricsWorker: error updating metrics');
   }
}

export function startMetricsWorker() {
   logger.info('MetricsWorker: starting');

   // Первое обновление сразу. void: fire-and-forget, отказ обработан
   // внутри try/catch самой updateAllMetrics
   void updateAllMetrics();

   setInterval(() => void updateAllMetrics(), METRICS_UPDATE_INTERVAL);

   logger.info(
      { intervalMs: METRICS_UPDATE_INTERVAL },
      'MetricsWorker: started',
   );
}

export async function forceMetricsUpdate() {
   await updateAllMetrics();
}
