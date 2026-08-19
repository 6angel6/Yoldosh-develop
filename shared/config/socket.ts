import http from 'http';
import logger from '../utils/logger';

import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { verifyToken } from '../utils/jwt';

let io: Server;

export const initSocket = (server: http.Server) => {
   io = new Server(server, {
      cors: {
         origin: '*',
         methods: ['GET', 'POST'],
      },
      // Увеличиваем лимиты для production
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      // На том же http-сервере живёт сырой WS-чат (/api/v1/chat/ws). По
      // умолчанию engine.io добивает «чужие» upgrade-запросы через 1с —
      // это убивало бы наше соединение. Отключаем: чужие upgrade оставляем
      // нашему обработчику (см. src/chat/realtime/chatWsServer.ts).
      destroyUpgrade: false,
   });

   // Инициализация Redis Adapter для горизонтального масштабирования
   const redisUrl = process.env.REDIS_URL || 'redis://yoldosh-redis-cache:6379';

   const pubClient = createClient({
      url: redisUrl,
      socket: {
         connectTimeout: 10000,
         reconnectStrategy: (retries) => {
            if (retries > 10) return false;
            return Math.min(retries * 100, 3000);
         },
      },
   });

   // Add error handlers to prevent 'missing error handler' warnings
   pubClient.on('error', (err) => {
      logger.warn({ err }, 'Socket.IO pub client error');
   });

   const subClient = pubClient.duplicate();

   subClient.on('error', (err) => {
      logger.warn({ err }, 'Socket.IO sub client error');
   });

   Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
         io.adapter(createAdapter(pubClient, subClient));
         logger.info('Socket.IO Redis adapter initialized successfully');
      })
      .catch((err) => {
         logger.error(
            { err },
            'Failed to initialize Socket.IO Redis adapter - running in single instance mode',
         );
      });

   // void: socket.io не ждёт промис от middleware; завершение всегда через next()
   io.use((socket: Socket, next) => {
      void (async () => {
         try {
            // На всякий случай добавил опциональную цепочку ?., чтобы не упало, если auth пустое
            const token = socket.handshake.auth?.token;

            if (!token) {
               return next(new Error('Authentication error: Token missing'));
            }

            const decoded = await verifyToken(token);
            if (decoded) {
               (socket as any).user = decoded;
               return next();
            }
            return next(new Error('Authentication error: Invalid token'));
         } catch {
            return next(new Error('Authentication error: Verification failed'));
         }
      })();
   });

   io.on('connection', (socket: Socket) => {
      const userId = (socket as any).user.id;
      logger.info({ userId, socketId: socket.id }, 'Socket connected');

      // Join user-specific room для персональных уведомлений.
      // void: с Redis-адаптером join возвращает промис, ждать его незачем
      void socket.join(userId);

      socket.on('disconnect', (reason) => {
         logger.info(
            { userId, socketId: socket.id, reason },
            'Socket disconnected',
         );
      });

      socket.on('error', (error) => {
         logger.error({ userId, socketId: socket.id, error }, 'Socket error');
      });
   });

   return io;
};

export const getIO = (): Server => {
   if (!io) {
      throw new Error('Socket.io not initialized!');
   }
   return io;
};
