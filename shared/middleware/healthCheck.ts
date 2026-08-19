import { Request, Response } from 'express';
import { db } from '../config/database';
import { redisClient } from '../config/redis';
import logger from '../utils/logger';

export const healthCheck = async (
   req: Request,
   res: Response,
): Promise<void> => {
   try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const dependencies = {
         database: { status: 'unknown' as string },
         redis: { status: 'unknown' as string },
      };

      try {
         await db.authenticate();
         dependencies.database.status = 'connected';
      } catch (error) {
         dependencies.database.status = 'disconnected';
         logger.error({ error }, 'Database readiness check failed');
      }

      try {
         await redisClient.ping();
         dependencies.redis.status = 'connected';
      } catch (error) {
         dependencies.redis.status = 'disconnected';
         logger.error({ error }, 'Redis readiness check failed');
      }

      const allHealthy = Object.values(dependencies).every(
         (dep) => dep.status === 'connected',
      );

      res.status(allHealthy ? 200 : 503).json({
         status: allHealthy ? 'healthy' : 'unhealthy',
         timestamp: new Date().toISOString(),
         uptime: Math.floor(uptime),
         memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
         },
         requestId: (req as any).id,
         dependencies,
      });
   } catch (error) {
      logger.error({ error }, 'Health check failed');
      res.status(500).json({
         status: 'unhealthy',
         error: 'Health check failed',
      });
   }
};
