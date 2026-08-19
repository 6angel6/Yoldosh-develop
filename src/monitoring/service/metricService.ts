import client from 'prom-client';
import logger from '../../../shared/utils/logger';
import type { Request, Response, NextFunction } from 'express';

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
   prefix: 'yoldosh_',
   // Оптимизированные buckets для GC
   gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

export const register = client.register;

const httpRequestDurationSeconds = new client.Histogram({
   name: 'http_request_duration_seconds',
   help: 'Duration of HTTP requests in seconds',
   labelNames: ['method', 'endpoint', 'status'],
   buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new client.Counter({
   name: 'http_requests_total',
   help: 'Total number of HTTP requests',
   labelNames: ['method', 'endpoint', 'status'],
});

// HTTP response size histogram (оптимизировано: меньше buckets)
const httpResponseSizeBytes = new client.Histogram({
   name: 'http_response_size_bytes',
   help: 'Size of HTTP responses in bytes',
   labelNames: ['method', 'endpoint', 'status'],
   buckets: [1000, 10000, 50000, 100000, 500000, 1000000],
});
export const tripSearchCounter = new client.Counter({
   name: 'trip_search_total',
   help: 'Total number of trip searches',
   labelNames: ['status'],
});

export const tripCreatedCounter = new client.Counter({
   name: 'trip_created_total',
   help: 'Total number of trips created',
});

export const tripCreationErrorsCounter = new client.Counter({
   name: 'trip_creation_errors_total',
   help: 'Total number of trip creation errors',
});

export const bookingCreatedCounter = new client.Counter({
   name: 'booking_created_total',
   help: 'Total number of bookings created',
});

export const bookingErrorsCounter = new client.Counter({
   name: 'booking_errors_total',
   help: 'Total number of booking errors',
});

export const bookingCanceledCounter = new client.Counter({
   name: 'booking_canceled_total',
   help: 'Total number of bookings canceled',
});

export const userRegistrationCounter = new client.Counter({
   name: 'user_registration_total',
   help: 'Total number of user registrations',
   labelNames: ['status'], // success, error
});

export const activeUsersGauge = new client.Gauge({
   name: 'active_users_current',
   help: 'Current number of active users (logged in last 24h)',
});

export const totalUsersGauge = new client.Gauge({
   name: 'total_users',
   help: 'Total number of registered users',
});

export const driverApplicationsGauge = new client.Gauge({
   name: 'driver_applications_total',
   help: 'Total number of driver applications by status',
   labelNames: ['status'], // pending, approved, rejected
});

export const routeRequestDuration = new client.Histogram({
   name: 'route_request_duration_seconds',
   help: 'Duration of requests by specific route',
   labelNames: ['method', 'route', 'status'],
   buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const routeRequestCount = new client.Counter({
   name: 'route_request_total',
   help: 'Total number of requests to specific routes',
   labelNames: ['method', 'route', 'status'],
});

export const routeErrorCount = new client.Counter({
   name: 'route_errors_total',
   help: 'Total number of errors by route',
   labelNames: ['method', 'route', 'error_type'],
});

export const userLoginCounter = new client.Counter({
   name: 'user_login_total',
   help: 'Total number of user logins',
   labelNames: ['status'],
});

export const paymentProcessedCounter = new client.Counter({
   name: 'payment_processed_total',
   help: 'Total number of payments processed',
   labelNames: ['status', 'provider'],
});

export const paymentAmountGauge = new client.Gauge({
   name: 'payment_amount_total',
   help: 'Total payment amount processed',
   labelNames: ['currency'],
});

// Database metrics (оптимизировано: меньше buckets)
export const dbQueryDurationSeconds = new client.Histogram({
   name: 'db_query_duration_seconds',
   help: 'Duration of database queries in seconds',
   labelNames: ['operation', 'table'],
   buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const dbPoolConnectionsGauge = new client.Gauge({
   name: 'db_pool_connections',
   help: 'Number of database pool connections',
   labelNames: ['state'], // 'idle', 'active', 'total'
});

// Redis metrics (оптимизировано: меньше buckets)
export const redisOperationDurationSeconds = new client.Histogram({
   name: 'redis_operation_duration_seconds',
   help: 'Duration of Redis operations in seconds',
   labelNames: ['operation'],
   buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
});

export const metricsMiddleware = (
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   const start = Date.now();
   const path = req.route?.path || req.path;

   // Normalize endpoint to avoid high cardinality
   const endpoint = normalizeEndpoint(path);
   const route = req.route?.path || 'unknown';

   res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const status = res.statusCode.toString();
      const method = req.method;

      httpRequestDurationSeconds.observe(
         { method, endpoint, status },
         duration,
      );
      httpRequestsTotal.inc({ method, endpoint, status });

      routeRequestDuration.observe({ method, route, status }, duration);
      routeRequestCount.inc({ method, route, status });

      if (res.statusCode >= 400) {
         const errorType =
            res.statusCode >= 500 ? 'server_error' : 'client_error';
         routeErrorCount.inc({ method, route, error_type: errorType });
      }

      const contentLength = res.get('content-length');
      if (contentLength) {
         httpResponseSizeBytes.observe(
            { method, endpoint, status },
            parseInt(contentLength, 10),
         );
      }
   });

   next();
};

export const responseTimeMiddleware = metricsMiddleware;

function normalizeEndpoint(path: string): string {
   if (!path) return '/unknown';

   return (
      path
         // Replace UUIDs
         .replace(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
            ':uuid',
         )
         // Replace numeric IDs
         .replace(/\/\d+/g, '/:id')
         // Replace query strings
         .replace(/\?.*$/, '')
   );
}

export async function updateUserMetrics(
   getUserStats: () => Promise<{
      total: number;
      active24h: number;
   }>,
) {
   try {
      const stats = await getUserStats();
      totalUsersGauge.set(stats.total);
      activeUsersGauge.set(stats.active24h);
   } catch (error) {
      logger.warn({ err: error }, 'Failed to update user metrics');
   }
}

export async function updateDriverApplicationMetrics(
   getDriverApps: () => Promise<{
      pending: number;
      approved: number;
      rejected: number;
   }>,
) {
   try {
      const stats = await getDriverApps();
      driverApplicationsGauge.set({ status: 'pending' }, stats.pending);
      driverApplicationsGauge.set({ status: 'approved' }, stats.approved);
      driverApplicationsGauge.set({ status: 'rejected' }, stats.rejected);
   } catch (error) {
      logger.warn(
         { err: error },
         'Failed to update driver application metrics',
      );
   }
}

export function updateDbPoolMetrics(pool: any) {
   try {
      dbPoolConnectionsGauge.set({ state: 'total' }, pool.totalCount || 0);
      dbPoolConnectionsGauge.set({ state: 'idle' }, pool.idleCount || 0);
      dbPoolConnectionsGauge.set(
         { state: 'active' },
         (pool.totalCount || 0) - (pool.idleCount || 0),
      );
   } catch (error) {
      logger.warn({ err: error }, 'Failed to update DB pool metrics');
   }
}

export async function getMetrics(): Promise<string> {
   return register.metrics();
}

export function getContentType(): string {
   return register.contentType;
}
