import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import logger from '../utils/logger';

const RATE_LIMIT_WINDOW = 60;
const MAX_ATTEMPTS = {
   login: 5,
   register: 3,
   passwordReset: 2,
};

export const rateLimitMiddleware =
   (endpoint: 'login' | 'register') =>
   async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const key = `ratelimit:${endpoint}:${req.ip}`;
      const maxAttempts = MAX_ATTEMPTS[endpoint];

      if (process.env.NODE_ENV === 'test') {
         return next();
      }

      try {
         const attemptsResult = await redisClient.incr(key);
         const attempts =
            typeof attemptsResult === 'number'
               ? attemptsResult
               : parseInt(attemptsResult as string);

         if (attempts === 1) {
            await redisClient.expire(key, RATE_LIMIT_WINDOW);
         }

         res.setHeader('X-RateLimit-Limit', maxAttempts);
         res.setHeader(
            'X-RateLimit-Remaining',
            Math.max(0, maxAttempts - attempts),
         );

         if (attempts > maxAttempts) {
            logger.warn(
               { ip: req.ip, endpoint, attempts },
               'Rate limit exceeded',
            );
            res.status(429).json({
               error: 'Too many requests. Please try again later.',
               retryAfter: RATE_LIMIT_WINDOW,
            });
            return;
         }

         next();
      } catch (error) {
         logger.error({ error, endpoint }, 'Rate limit check failed');
         next();
      }
   };
