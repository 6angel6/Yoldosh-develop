/**
 * Протокол чат-сокета `chat.v1` (см. spec §2, §5, §6, §8).
 *
 * Каждый кадр в обе стороны — один JSON-объект `{ type, data }`. Этот модуль
 * содержит только (де)сериализацию и типы; вся логика — в chatWsServer.ts.
 * Форма сообщения (§6) совпадает с REST-DTO, поэтому один сериализатор
 * обслуживает оба транспорта.
 */

// Сабпротокол из upgrade-запроса — должен быть принят (spec §1).
export const SUBPROTOCOL = 'chat.v1';

// Путь эндпоинта. wss://<host>/api/v1/chat/ws (spec §1).
export const WS_PATH = '/api/v1/chat/ws';

// Коды закрытия (spec §8).
export enum CloseCode {
   // Auth/policy — фатально, клиент не переподключается до повторного
   // открытия треда.
   POLICY = 1008,
   // Перманентный отказ на уровне приложения (4000–4999) — тоже фатально.
   APP_FORBIDDEN = 4003,
}

// Кадр «клиент → сервер» после разбора.
export interface IncomingFrame {
   type: string;
   data: Record<string, any>;
}

// Форма сообщения (spec §6). mediaUrl всегда null — медиа в этом протоколе нет.
export interface WsMessage {
   id: string;
   chatId: string;
   senderId: string;
   content: string | null;
   mediaUrl: null;
   isRead: boolean;
   createdAt?: string;
   updatedAt?: string;
   sender?: { id: string; firstName?: string };
}

export interface SenderInfo {
   id: string;
   firstName?: string;
}

// Собирает кадр `{ type, data }` в строку для отправки.
export const encode = (type: string, data?: Record<string, any>): string =>
   JSON.stringify({ type, data: data ?? {} });

/**
 * Разбирает входящий кадр. Возвращает null, если это не JSON-объект или нет
 * строкового `type` — такие кадры клиент тоже молча роняет (spec §2), так же
 * поступаем и на сервере. `data` нормализуется до объекта.
 */
export const safeParse = (raw: string): IncomingFrame | null => {
   let parsed: any;
   try {
      parsed = JSON.parse(raw);
   } catch {
      return null;
   }
   if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof parsed.type !== 'string'
   ) {
      return null;
   }
   const data =
      parsed.data &&
      typeof parsed.data === 'object' &&
      !Array.isArray(parsed.data)
         ? parsed.data
         : {};
   return { type: parsed.type, data };
};

const toIso = (value: unknown): string | undefined => {
   if (value instanceof Date) return value.toISOString();
   if (typeof value === 'string') return value;
   return undefined;
};

/**
 * Приводит сообщение (Sequelize-инстанс или plain) к форме §6.
 * `fallbackSender` подставляется, когда include `sender` не загружен —
 * для только что созданного сообщения отправителем является локальный
 * пользователь соединения (его id/firstName известны).
 */
export const serializeMessage = (
   msg: any,
   fallbackSender?: SenderInfo,
): WsMessage => {
   const m = typeof msg?.get === 'function' ? msg.get({ plain: true }) : msg;

   let sender: WsMessage['sender'];
   if (m?.sender && m.sender.id) {
      sender = { id: m.sender.id, firstName: m.sender.firstName };
   } else if (fallbackSender) {
      sender = { id: fallbackSender.id, firstName: fallbackSender.firstName };
   }

   return {
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      content: m.content ?? null,
      mediaUrl: null,
      isRead: !!m.isRead,
      createdAt: toIso(m.createdAt),
      updatedAt: toIso(m.updatedAt),
      sender,
   };
};
