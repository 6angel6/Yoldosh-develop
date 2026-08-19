import dotenv from 'dotenv';
import logger from '../utils/logger';
import { createClient } from 'redis';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
if (!redisUrl) {
   logger.error(
      { redisUrl },
      'Missing required database environment variables.',
   );
}

let _redisAvailable = false;

export const setRedisAvailable = (value: boolean) => {
   _redisAvailable = value;
};

export const getRedisAvailable = () => _redisAvailable;

// Для обратной совместимости
export const redisAvailable = new Proxy({} as any, {
   get: () => _redisAvailable,
});

export const redisClient = createRedisClient();

function createRedisClient() {
   const client = createClient({
      url: redisUrl,
      socket: {
         reconnectStrategy: (retries) => {
            // Бесконечные попытки переподключения с exponential backoff
            const delay = Math.min(Math.pow(2, retries) * 1000, 30000); // max 30s
            if (retries <= 3 || retries % 5 === 0) {
               logger.info(
                  `Redis cache: reconnecting in ${delay}ms (attempt ${retries})`,
               );
            }
            return delay;
         },
         connectTimeout: 10000,
      },
      disableOfflineQueue: true,
   });

   // void: event-эмиттер не ждёт промис; отказ обработан внутри try/catch
   client.on('ready', () => {
      void (async () => {
         try {
            await client.ping();
            const wasOffline = !getRedisAvailable();
            setRedisAvailable(true);
            if (wasOffline) {
               logger.info('Redis cache: RECONNECTED and operational');
            } else {
               logger.info('Redis cache: connected and ready');
            }
         } catch (err) {
            setRedisAvailable(false);
            logger.warn({ err }, 'Redis cache: ready event but ping failed');
         }
      })();
   });

   client.on('reconnecting', () => {
      const wasAvailable = getRedisAvailable();
      setRedisAvailable(false);
      if (wasAvailable) {
         logger.warn(
            'Redis cache: connection lost, attempting to reconnect...',
         );
      }
   });

   client.on('end', () => {
      const wasAvailable = getRedisAvailable();
      setRedisAvailable(false);
      if (wasAvailable) {
         logger.warn('Redis cache: connection ended');
      }
   });

   client.on('error', (err) => {
      // Только логируем критические ошибки, не спамим
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
         if (getRedisAvailable()) {
            logger.warn({ code: err.code }, 'Redis cache: connection error');
         }
      }
      setRedisAvailable(false);
   });

   return client;
}

// void: fire-and-forget на старте, отказ обработан внутри try/catch
void (async () => {
   try {
      await redisClient.connect();
   } catch (error) {
      logger.error(
         { err: error },
         'Could not connect to Redis. Working without cache.',
      );
   }
})();

// void: setInterval не ждёт промис; отказ обработан внутри try/catch
setInterval(() => {
   void (async () => {
      if (!redisClient.isOpen) {
         // Redis client will auto-reconnect via reconnectStrategy
         return;
      }

      try {
         await redisClient.ping();
         const currentStatus = getRedisAvailable();
         if (!currentStatus) {
            logger.info('Redis health check: connection restored');
         }
         setRedisAvailable(true);
      } catch (err) {
         const currentStatus = getRedisAvailable();
         if (currentStatus) {
            logger.warn({ err }, 'Redis health check: connection lost');
         }
         setRedisAvailable(false);
      }
   })();
}, 10000);

export const getOrSetCache = async <T>(
   key: string,
   fetchDataCallback: () => Promise<T>,
   ttl: number = 3600,
): Promise<T> => {
   if (!redisClient.isOpen) {
      logger.warn({ cacheKey: key }, 'Redis unavailable → using DB instead');
      return await fetchDataCallback();
   }
   if (!getRedisAvailable()) {
      logger.warn({ cacheKey: key }, 'Redis OFFLINE → using DB instead');
      return await fetchDataCallback();
   }

   try {
      const cachedData = await redisClient.get(key);

      if (cachedData) {
         logger.debug({ cacheKey: key }, 'Cache HIT');
         if (typeof cachedData === 'string') {
            return JSON.parse(cachedData);
         }
      }

      logger.debug({ cacheKey: key }, 'Cache MISS');
      const freshData = await fetchDataCallback();

      await redisClient.set(key, JSON.stringify(freshData), {
         EX: ttl,
         NX: true,
      });

      return freshData;
   } catch (error) {
      setRedisAvailable(false);
      logger.error(
         { err: error, cacheKey: key },
         'Redis Error. Switching to DB',
      );
      return await fetchDataCallback();
   }
};

/**
 * Удаляет ключи по паттерну. Для одиночного ключа — DEL напрямую.
 * Для glob-паттерна использует SCAN (курсорный обход), чтобы не блокировать
 * Redis event loop — KEYS на нагруженном инстансе «подвешивает» всё.
 */
export const clearCache = async (pattern: string) => {
   if (!redisClient.isOpen || !getRedisAvailable()) {
      logger.debug({ pattern }, 'Redis unavailable, clear cache skipped');
      return;
   }

   try {
      // Быстрый путь для точного ключа (без wildcards)
      if (
         !pattern.includes('*') &&
         !pattern.includes('?') &&
         !pattern.includes('[')
      ) {
         await redisClient.del(pattern);
         return;
      }

      let cursor: string = '0';
      let totalDeleted = 0;
      do {
         const reply = await redisClient.scan(cursor, {
            MATCH: pattern,
            COUNT: 500,
         });
         cursor = reply.cursor as unknown as string;
         const batch = reply.keys;
         if (batch.length > 0) {
            await redisClient.del(batch);
            totalDeleted += batch.length;
         }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
         logger.info(
            { pattern, deleted: totalDeleted },
            'Cache cleared (SCAN)',
         );
      }
   } catch (error) {
      logger.warn(
         { err: error, pattern },
         'Failed to clear cache, continuing without cache',
      );
      setRedisAvailable(false);
   }
};
