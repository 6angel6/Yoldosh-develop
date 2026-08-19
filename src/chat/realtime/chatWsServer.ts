/**
 * Чат-эндпоинт реального времени `wss://<host>/api/v1/chat/ws` (spec §1–§9).
 *
 * Сырой WebSocket (сабпротокол `chat.v1`, JSON-конверты) — НЕ Socket.IO:
 * мобильный клиент говорит на сыром WS, а Socket.IO-фрейминг несовместим.
 * Сервер живёт на том же http.Server, что и Socket.IO: маршрутизация по
 * пути в обработчике `upgrade`. Чтобы Socket.IO (engine.io) не убивал наш
 * upgrade как «чужой», в его инициализации выставлен `destroyUpgrade: false`
 * (см. shared/config/socket.ts).
 */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import logger from '../../../shared/utils/logger';
import { verifyToken } from '../../../shared/utils/jwt';
import { findUserById } from '../../user/repository/userRepository';
import * as chatService from '../service/chatService';
import * as hub from './chatHub';
import { ChatConnection } from './chatHub';
import {
   CloseCode,
   SUBPROTOCOL,
   WS_PATH,
   encode,
   safeParse,
   serializeMessage,
} from './protocol';

const HEARTBEAT_INTERVAL_MS = 30000;

const safeSend = (ws: WebSocket, frame: string): void => {
   if (ws.readyState === WebSocket.OPEN) {
      try {
         ws.send(frame);
      } catch (err) {
         logger.warn({ err }, 'chat ws send failed');
      }
   }
};

const safeClose = (ws: WebSocket, code: number, reason: string): void => {
   try {
      ws.close(code, reason);
   } catch {
      /* соединение уже закрыто */
   }
};

export const initChatWebSocket = (server: http.Server): WebSocketServer => {
   void hub.initChatHub();

   const wss = new WebSocketServer({
      noServer: true,
      // Принимаем сабпротокол chat.v1 и эхо-подтверждаем его в ответе (spec §1).
      handleProtocols: (protocols: Set<string>) =>
         protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false,
   });

   server.on('upgrade', (req, socket, head) => {
      let pathname: string;
      try {
         pathname = new URL(req.url || '', 'http://localhost').pathname;
      } catch {
         return;
      }
      // Не наш путь — отдаём Socket.IO/остальным обработчикам upgrade.
      if (pathname !== WS_PATH) return;

      const authHeader = (req.headers['authorization'] as string) || '';
      const token = authHeader.startsWith('Bearer ')
         ? authHeader.slice(7).trim()
         : '';

      void (async () => {
         const user = token ? await verifyToken(token) : null;

         // Невалидный/просроченный токен: завершаем handshake и сразу
         // закрываем 1008 — клиент попадает в фатальное состояние без шторма
         // переподключений (spec §1, §8), вместо обрыва upgrade с ретраями.
         if (!user || !user.id) {
            wss.handleUpgrade(req, socket, head, (ws) => {
               safeClose(ws, CloseCode.POLICY, 'unauthorized');
            });
            return;
         }

         wss.handleUpgrade(req, socket, head, (ws) => {
            void onConnection(ws, user.id);
         });
      })();
   });

   // Heartbeat: клиент шлёт WS-ping каждые 20с (ws авто-отвечает pong), а сервер
   // пингует сам и отстреливает «мёртвые» сокеты, не ответившие pong (spec §1).
   const heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
         const conn = (ws as any)._chatConn as ChatConnection | undefined;
         if (!conn) continue;
         if (!conn.isAlive) {
            try {
               ws.terminate();
            } catch {
               /* noop */
            }
            continue;
         }
         conn.isAlive = false;
         try {
            ws.ping();
         } catch {
            /* noop */
         }
         // Продлеваем presence-ключ (TTL 60с) для подписанных соединений,
         // чтобы онлайн-статус не «протухал» на долгих сессиях (spec §5).
         if (conn.chatId) void hub.setOnline(conn.userId);
      }
   }, HEARTBEAT_INTERVAL_MS);
   if (typeof heartbeat.unref === 'function') heartbeat.unref();
   wss.on('close', () => clearInterval(heartbeat));

   logger.info({ path: WS_PATH }, 'Chat WebSocket endpoint initialized');
   return wss;
};

const onConnection = async (ws: WebSocket, userId: string): Promise<void> => {
   const conn: ChatConnection = { ws, userId, isAlive: true };
   (ws as any)._chatConn = conn;
   hub.register(conn);

   // Имя отправителя для sender.firstName в исходящих сообщениях (spec §6).
   try {
      const u = await findUserById(userId);
      conn.firstName = u?.firstName;
   } catch (err) {
      logger.warn({ err, userId }, 'chat ws: failed to load sender name');
   }

   // Живость соединения: и pong на наш ping, и собственный ping клиента
   // (каждые 20с, spec §1) считаем признаком жизни — не зависим от того,
   // отвечает ли клиент pong-ом на серверный ping.
   ws.on('pong', () => {
      conn.isAlive = true;
   });
   ws.on('ping', () => {
      conn.isAlive = true;
   });
   ws.on('message', (raw) => {
      void onMessage(conn, raw.toString());
   });
   ws.on('error', (err) =>
      logger.warn({ err, userId }, 'chat ws socket error'),
   );
   ws.on('close', () => {
      void onClose(conn);
   });

   // Готовность соединения → клиент шлёт chat.subscribe (spec §3).
   safeSend(ws, encode('auth.ok', {}));
};

const onMessage = async (conn: ChatConnection, raw: string): Promise<void> => {
   const frame = safeParse(raw);
   if (!frame) return; // не JSON-объект — молча роняем (spec §2)

   try {
      switch (frame.type) {
         case 'chat.subscribe':
            return await handleSubscribe(conn, frame.data);
         case 'message.send':
            return await handleSend(conn, frame.data);
         case 'message.read':
            return await handleRead(conn, frame.data);
         case 'typing':
            return handleTyping(conn, frame.data);
         default:
            return; // неизвестный type игнорируется (spec §2)
      }
   } catch (err) {
      // Ошибку обработчика НЕ превращаем в кадр `error` — тот трактуется
      // клиентом как «сессия мертва» и глушит весь реалтайм. Для message.send
      // отсутствие ack само уронит отправку в REST по таймауту 8с (spec §7),
      // сохранив живое соединение для остальных событий.
      logger.warn(
         { err, type: frame.type, userId: conn.userId },
         'chat ws handler error',
      );
   }
};

const handleSubscribe = async (
   conn: ChatConnection,
   data: Record<string, any>,
): Promise<void> => {
   const chatId = data.chatId;
   if (typeof chatId !== 'string' || !chatId) return;

   const chat = await chatService.getChatForParticipant(chatId, conn.userId);
   if (!chat) {
      // Подписка на чужой/несуществующий чат — перманентный отказ (spec §8).
      safeClose(conn.ws, CloseCode.APP_FORBIDDEN, 'forbidden');
      return;
   }

   conn.chatId = chatId;
   conn.peerId =
      chat.participant1Id === conn.userId
         ? chat.participant2Id
         : chat.participant1Id;

   // Presence (опционально): помечаем себя онлайн, шлём переход собеседнику
   // и отдаём текущий статус собеседника этому клиенту (spec §5).
   await hub.setOnline(conn.userId);
   hub.deliverToChatPeer(
      chatId,
      conn.peerId,
      encode('presence', {
         userId: conn.userId,
         online: true,
         lastSeen: null,
      }),
   );

   const peerOnline = await hub.isOnline(conn.peerId);
   if (peerOnline) {
      safeSend(
         conn.ws,
         encode('presence', {
            userId: conn.peerId,
            online: true,
            lastSeen: null,
         }),
      );
   }
};

const handleSend = async (
   conn: ChatConnection,
   data: Record<string, any>,
): Promise<void> => {
   const chatId = data.chatId;
   if (typeof chatId !== 'string' || !chatId) return;

   const content = typeof data.content === 'string' ? data.content : undefined;
   const clientId =
      typeof data.clientId === 'string' ? data.clientId : undefined;

   // Персист + дедуп по (chatId, clientId) + инкремент unread + парити со
   // списком чатов — всё в сервисе (spec §4.2, §4.4, §7, §9). Бросит, если
   // отправитель не участник / заблокирован → уходит в REST по таймауту.
   const message = await chatService.sendMessage(
      chatId,
      conn.userId,
      content,
      undefined,
      conn.firstName,
      clientId,
   );

   const senderInfo = { id: conn.userId, firstName: conn.firstName };

   // ack — только в соединение отправителя (spec §4.2).
   safeSend(
      conn.ws,
      encode('message.ack', {
         clientId,
         message: serializeMessage(message, senderInfo),
      }),
   );

   // Пуш `message.new` собеседнику — НИКОГДА не эхо отправителю (spec §4.3).
   let peerId = conn.chatId === chatId ? conn.peerId : undefined;
   if (!peerId) {
      const chat = await chatService.getChatForParticipant(chatId, conn.userId);
      if (chat) {
         peerId =
            chat.participant1Id === conn.userId
               ? chat.participant2Id
               : chat.participant1Id;
      }
   }
   if (peerId) {
      hub.deliverToChatPeer(
         chatId,
         peerId,
         encode('message.new', serializeMessage(message, senderInfo)),
      );
   }
};

const handleRead = async (
   conn: ChatConnection,
   data: Record<string, any>,
): Promise<void> => {
   const chatId = data.chatId;
   if (typeof chatId !== 'string' || !chatId) return;

   const messageIds: string[] = Array.isArray(data.messageIds)
      ? data.messageIds.filter((id: unknown) => typeof id === 'string')
      : [];

   // Помечаем прочитанным + обнуляем счётчик читателя (spec §4, §9).
   const peerId = await chatService.markChatRead(
      chatId,
      conn.userId,
      messageIds,
   );
   if (!peerId) return;

   // Рассылаем `message.read` собеседнику (spec §4, §5).
   hub.deliverToChatPeer(
      chatId,
      peerId,
      encode('message.read', {
         chatId,
         messageIds,
         readerId: conn.userId,
      }),
   );
};

const handleTyping = (
   conn: ChatConnection,
   data: Record<string, any>,
): void => {
   const chatId = data.chatId;
   if (typeof chatId !== 'string' || !chatId) return;

   // Ретранслируем только когда знаем собеседника (подписаны на этот чат).
   const peerId = conn.chatId === chatId ? conn.peerId : undefined;
   if (!peerId) return;

   hub.deliverToChatPeer(
      chatId,
      peerId,
      encode('typing', {
         chatId,
         userId: conn.userId,
         isTyping: !!data.isTyping,
      }),
   );
};

const onClose = async (conn: ChatConnection): Promise<void> => {
   hub.unregister(conn);

   // Presence offline — только когда у пользователя не осталось локальных
   // соединений и он был подписан на чат (знаем, кому слать).
   if (conn.chatId && conn.peerId && !hub.hasLocalConnections(conn.userId)) {
      await hub.clearOnline(conn.userId);
      hub.deliverToChatPeer(
         conn.chatId,
         conn.peerId,
         encode('presence', {
            userId: conn.userId,
            online: false,
            lastSeen: new Date().toISOString(),
         }),
      );
   }
};
