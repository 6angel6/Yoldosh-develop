/**
 * Реестр соединений чат-сокета + горизонтальное масштабирование.
 *
 * Мобильный клиент открывает по одному сокету на тред и подписывается на его
 * chatId (spec §3). Доставка событий (`message.new`, `message.read`, `typing`,
 * `presence`) адресуется паре (targetUserId, chatId): локально — напрямую в
 * подходящие сокеты, между инстансами — через Redis pub/sub (участники могут
 * висеть на разных нодах за балансировщиком).
 *
 * При недоступности Redis всё деградирует до single-instance режима (как и
 * существующий Socket.IO-адаптер): локальная доставка работает, кросс-нодовая
 * молча выключается.
 */
import { createClient } from 'redis';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import logger from '../../../shared/utils/logger';

export interface ChatConnection {
   ws: WebSocket;
   userId: string;
   firstName?: string;
   // chatId, на который подписан сокет (после `chat.subscribe`).
   chatId?: string;
   // id собеседника в этом чате (кэш, чтобы не ходить в БД на каждый typing).
   peerId?: string;
   // Heartbeat: сбрасывается в false перед ping, поднимается в true на pong.
   isAlive: boolean;
}

// Уникальный id процесса — чтобы не доставлять собственный эхо-кадр из pub/sub
// дважды (локально уже доставили при публикации).
const INSTANCE_ID = randomUUID();

const EVENTS_CHANNEL = 'chat:ws:events';
const PRESENCE_TTL_SEC = 60;
const presenceKey = (userId: string) => `chat:ws:online:${userId}`;

// userId → его локальные соединения на этом инстансе.
const byUser = new Map<string, Set<ChatConnection>>();

type RedisClient = ReturnType<typeof createClient>;

let pub: RedisClient | null = null;
let sub: RedisClient | null = null;
let redisReady = false;

interface FanoutPayload {
   chatId: string;
   targetUserId: string;
   frame: string; // уже сериализованный кадр (encode())
   origin: string;
}

// --- Локальный реестр ---------------------------------------------------

export const register = (conn: ChatConnection): void => {
   let set = byUser.get(conn.userId);
   if (!set) {
      set = new Set();
      byUser.set(conn.userId, set);
   }
   set.add(conn);
};

export const unregister = (conn: ChatConnection): void => {
   const set = byUser.get(conn.userId);
   if (!set) return;
   set.delete(conn);
   if (set.size === 0) byUser.delete(conn.userId);
};

export const hasLocalConnections = (userId: string): boolean => {
   const set = byUser.get(userId);
   return !!set && set.size > 0;
};

const sendRaw = (conn: ChatConnection, frame: string): void => {
   if (conn.ws.readyState === WebSocket.OPEN) {
      try {
         conn.ws.send(frame);
      } catch (err) {
         logger.warn({ err, userId: conn.userId }, 'chat ws send failed');
      }
   }
};

// Доставка кадра всем локальным сокетам пользователя, подписанным на этот чат.
const deliverLocal = (
   targetUserId: string,
   chatId: string,
   frame: string,
): void => {
   const set = byUser.get(targetUserId);
   if (!set) return;
   for (const conn of set) {
      if (conn.chatId === chatId) sendRaw(conn, frame);
   }
};

// --- Кросс-инстансная доставка ------------------------------------------

const publish = (payload: Omit<FanoutPayload, 'origin'>): void => {
   if (!pub || !redisReady) return;
   pub.publish(
      EVENTS_CHANNEL,
      JSON.stringify({ ...payload, origin: INSTANCE_ID }),
   ).catch((err) => logger.warn({ err }, 'chat ws fan-out publish failed'));
};

/**
 * Доставляет `frame` пользователю `targetUserId` в контексте `chatId`:
 * локально сразу, и публикует в Redis для других инстансов. Эхо собственной
 * публикации на приёме отбрасывается по origin — двойной доставки нет.
 */
export const deliverToChatPeer = (
   chatId: string,
   targetUserId: string,
   frame: string,
): void => {
   deliverLocal(targetUserId, chatId, frame);
   publish({ chatId, targetUserId, frame });
};

const onRedisMessage = (raw: string): void => {
   let payload: FanoutPayload;
   try {
      payload = JSON.parse(raw);
   } catch {
      return;
   }
   // Собственный эхо-кадр — уже доставлен локально при публикации.
   if (payload.origin === INSTANCE_ID) return;
   deliverLocal(payload.targetUserId, payload.chatId, payload.frame);
};

// --- Presence (spec §5, опциональная фича) ------------------------------

// Помечает пользователя онлайн в Redis с TTL (обновляется heartbeat-ом).
export const setOnline = async (userId: string): Promise<void> => {
   if (!pub || !redisReady) return;
   try {
      await pub.set(presenceKey(userId), INSTANCE_ID, { EX: PRESENCE_TTL_SEC });
   } catch (err) {
      logger.warn({ err, userId }, 'chat ws presence set failed');
   }
};

export const clearOnline = async (userId: string): Promise<void> => {
   if (!pub || !redisReady) return;
   try {
      await pub.del(presenceKey(userId));
   } catch (err) {
      logger.warn({ err, userId }, 'chat ws presence clear failed');
   }
};

// Онлайн, если есть локальные соединения или живой presence-ключ в Redis.
export const isOnline = async (userId: string): Promise<boolean> => {
   if (hasLocalConnections(userId)) return true;
   if (!pub || !redisReady) return false;
   try {
      return (await pub.exists(presenceKey(userId))) === 1;
   } catch {
      return false;
   }
};

// --- Инициализация ------------------------------------------------------

export const initChatHub = async (): Promise<void> => {
   const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
   try {
      pub = createClient({
         url: redisUrl,
         socket: {
            connectTimeout: 10000,
            reconnectStrategy: (retries) => {
               if (retries > 10) return false;
               return Math.min(retries * 100, 3000);
            },
         },
      });
      sub = pub.duplicate();

      pub.on('error', (err) => logger.warn({ err }, 'chat ws pub error'));
      sub.on('error', (err) => logger.warn({ err }, 'chat ws sub error'));

      await Promise.all([pub.connect(), sub.connect()]);
      await sub.subscribe(EVENTS_CHANNEL, onRedisMessage);

      redisReady = true;
      logger.info('Chat WS Redis fan-out initialized (multi-instance ready)');
   } catch (err) {
      redisReady = false;
      logger.warn(
         { err },
         'Chat WS running in single-instance mode (Redis fan-out unavailable)',
      );
   }
};
