import { Request, Response, NextFunction } from 'express';
import { redisClient, getRedisAvailable } from '../config/redis';
import logger from '../utils/logger';
import crypto from 'crypto';

export interface IdempotencyOptions {
   /**
    * Время хранения результата в Redis (секунды)
    * По умолчанию: 86400 (24 часа)
    */
   ttl?: number;

   /**
    * Название заголовка для idempotency key
    * По умолчанию: 'Idempotency-Key'
    */
   headerName?: string;

   /**
    * Обязательно ли наличие ключа
    * По умолчанию: true для POST/PUT/PATCH, false для GET/DELETE
    */
   required?: boolean;

   /**
    * Префикс для ключей в Redis
    * По умолчанию: 'idempotency'
    */
   keyPrefix?: string;
}

interface CachedResponse {
   statusCode: number;
   headers: Record<string, string>;
   body: any;
   timestamp: number;
}

const LOCK_SUFFIX = ':lock';
const RESULT_SUFFIX = ':result';
const LOCK_TTL = 300; // 5 минут для lock

export const idempotencyMiddleware = (options: IdempotencyOptions = {}) => {
   const {
      ttl = 86400, // 24 часа
      headerName = 'Idempotency-Key',
      required = undefined,
      keyPrefix = 'idempotency',
   } = options;

   return async (req: Request, res: Response, next: NextFunction) => {
      const method = req.method.toUpperCase();

      const needsIdempotency =
         required !== undefined
            ? required
            : ['POST', 'PUT', 'PATCH'].includes(method);

      if (!needsIdempotency) {
         return next();
      }

      const idempotencyKey = req.headers[headerName.toLowerCase()] as string;

      if (!idempotencyKey) {
         if (
            required === true ||
            (required === undefined && method === 'POST')
         ) {
            return res.status(400).json({
               error: 'Bad Request',
               message: `${headerName} header is required for ${method} requests`,
            });
         }
         return next();
      }

      // Валидация формата ключа (UUID или минимум 16 символов)
      if (idempotencyKey.length < 16) {
         return res.status(400).json({
            error: 'Bad Request',
            message: `${headerName} must be at least 16 characters long`,
         });
      }

      const requestHash = crypto
         .createHash('sha256')
         .update(`${method}:${req.path}:${idempotencyKey}`)
         .digest('hex')
         .substring(0, 32);

      const lockKey = `${keyPrefix}:${requestHash}${LOCK_SUFFIX}`;
      const resultKey = `${keyPrefix}:${requestHash}${RESULT_SUFFIX}`;

      if (!getRedisAvailable() || !redisClient.isOpen) {
         logger.warn('Redis unavailable - skipping idempotency check');
         return next();
      }

      try {
         const cachedResult = await redisClient.get(resultKey);

         if (cachedResult) {
            const parsed: CachedResponse = JSON.parse(cachedResult.toString());
            logger.info(
               {
                  idempotencyKey,
                  requestHash,
                  statusCode: parsed.statusCode,
                  age: Date.now() - parsed.timestamp,
               },
               'Returning cached idempotent response',
            );

            res.set(parsed.headers);
            res.set('X-Idempotency-Cached', 'true');
            return res.status(parsed.statusCode).json(parsed.body);
         }

         const lockAcquired = await redisClient.set(lockKey, '1', {
            NX: true,
            EX: LOCK_TTL,
         });

         if (!lockAcquired) {
            logger.warn(
               {
                  idempotencyKey,
                  requestHash,
               },
               'Duplicate request detected - request already in progress',
            );

            return res.status(409).json({
               error: 'Conflict',
               message:
                  'A request with this idempotency key is already being processed',
               retryAfter: 5,
            });
         }

         const originalJson = res.json.bind(res);
         const originalStatus = res.status.bind(res);
         let responseStatus = 200;

         res.status = function (code: number) {
            responseStatus = code;
            return originalStatus(code);
         };

         res.json = function (body: any) {
            if (responseStatus >= 200 && responseStatus < 300) {
               const cachedResponse: CachedResponse = {
                  statusCode: responseStatus,
                  headers: {
                     'content-type': 'application/json',
                  },
                  body,
                  timestamp: Date.now(),
               };

               redisClient
                  .setEx(resultKey, ttl, JSON.stringify(cachedResponse))
                  .then(() => {
                     logger.info(
                        {
                           idempotencyKey,
                           requestHash,
                           statusCode: responseStatus,
                           ttl,
                        },
                        'Cached idempotent response',
                     );
                  })
                  .catch((err) => {
                     logger.error(
                        { err, idempotencyKey, requestHash },
                        'Failed to cache idempotent response',
                     );
                  });
            }

            redisClient.del(lockKey).catch((err) => {
               logger.error(
                  { err, lockKey },
                  'Failed to release idempotency lock',
               );
            });

            return originalJson(body);
         };

         res.on('finish', () => {
            if (res.statusCode >= 500) {
               redisClient.del(lockKey).catch((err) => {
                  logger.error(
                     { err, lockKey },
                     'Failed to release idempotency lock on error',
                  );
               });
            }
         });

         next();
      } catch (error) {
         logger.error(
            { error, idempotencyKey, requestHash },
            'Idempotency middleware error',
         );

         // В случае ошибки Redis не блокируем запрос
         next();
      }
   };
};
