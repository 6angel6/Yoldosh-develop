import { Request, Response } from 'express';
import { getMetrics, getContentType } from '../service/metricService';
import logger from '../../../shared/utils/logger';

export const metrics = async (req: Request, res: Response) => {
   try {
      res.set('Content-Type', getContentType());
      const metricsData = await getMetrics();
      res.end(metricsData);
   } catch (error) {
      logger.error({ error }, 'Error collecting metrics');
      res.status(500).send('Error collecting metrics');
   }
};

export const healthCheck = async (req: Request, res: Response) => {
   res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
   });
};
