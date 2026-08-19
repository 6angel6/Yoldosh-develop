import Chat from '../models/Chat';
import Message from '../models/Message';
import { UserRole } from '../../user/models/User';
import { findUserByPhoneNumber } from '../../user/repository/userRepository';
import {
   createMessage,
   saveChat,
   findActiveChatsWithTripByUser,
   findLastMessageByChatAndSender,
} from '../repository/chatRepository';
import { NotificationType } from '../models/Notification';
import { createNotification } from './notificationService';

import logger from '../../../shared/utils/logger';
import { getIO } from '../../../shared/config/socket';
import { BadRequestError } from '../../../shared/utils/errorHandler';
import { redisClient, getRedisAvailable } from '../../../shared/config/redis';

import type { IncomingDriverChatDto } from '../dto/incomingDriverChatDto';

const DEDUP_TTL_SECONDS = 24 * 3600;
const ACTIVE_WINDOW_MS = 24 * 3600 * 1000;
const MAX_MESSAGE_LENGTH = 4096;
const LOG_PREFIX = '[CHAT_BRIDGE]';

export interface IncomingDriverChatResult {
   chatId: string | null;
   deliveredToPassenger: boolean;
}

const buildDedupKey = (
   senderSession: string,
   tgUserId: number,
   tgMessageId: number,
): string => `driver_chat_incoming:${senderSession}:${tgUserId}:${tgMessageId}`;

const readDedup = async (
   key: string,
): Promise<IncomingDriverChatResult | null> => {
   if (!redisClient.isOpen || !getRedisAvailable()) return null;
   try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      const str = typeof raw === 'string' ? raw : raw.toString('utf-8');
      return JSON.parse(str) as IncomingDriverChatResult;
   } catch (err) {
      logger.warn({ err, key }, `${LOG_PREFIX} dedup read failed`);
      return null;
   }
};

const writeDedup = async (
   key: string,
   result: IncomingDriverChatResult,
): Promise<void> => {
   if (!redisClient.isOpen || !getRedisAvailable()) return;
   try {
      await redisClient.set(key, JSON.stringify(result), {
         EX: DEDUP_TTL_SECONDS,
      });
   } catch (err) {
      logger.warn({ err, key }, `${LOG_PREFIX} dedup write failed`);
   }
};

interface ChatCandidate {
   chat: Chat;
   passengerId: string;
   lastPassengerMsgAt: Date | null;
}

const pickActiveChatForDriver = async (
   driverId: string,
): Promise<ChatCandidate | null> => {
   const chats = await findActiveChatsWithTripByUser(driverId);

   if (chats.length === 0) return null;

   const candidates: ChatCandidate[] = [];
   for (const chat of chats) {
      const passengerId =
         chat.participant1Id === driverId
            ? chat.participant2Id
            : chat.participant1Id;

      const lastMsg = await findLastMessageByChatAndSender(
         chat.id,
         passengerId,
      );

      candidates.push({
         chat,
         passengerId,
         lastPassengerMsgAt: lastMsg ? lastMsg.createdAt : null,
      });
   }

   candidates.sort((a, b) => {
      const at = a.lastPassengerMsgAt?.getTime() ?? 0;
      const bt = b.lastPassengerMsgAt?.getTime() ?? 0;
      return bt - at;
   });

   const best = candidates[0];
   if (!best.lastPassengerMsgAt) return null;

   const ageMs = Date.now() - best.lastPassengerMsgAt.getTime();
   if (ageMs > ACTIVE_WINDOW_MS) return null;

   return best;
};

const truncateText = (text: string): string =>
   text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH) : text;

const deliverMessageToChat = async (
   chat: Chat,
   driverId: string,
   passengerId: string,
   driverName: string,
   text: string,
): Promise<Message> => {
   const message = await createMessage({
      chatId: chat.id,
      senderId: driverId,
      content: text,
   });

   if (chat.participant1Id === driverId) {
      (chat as any).unreadCount2 += 1;
   } else {
      (chat as any).unreadCount1 += 1;
   }
   await saveChat(chat);

   try {
      const io = getIO();
      io.to(passengerId).emit('new_message', message);

      const lastMessagePayload = {
         content: text,
         createdAt: message.createdAt,
         isRead: false,
         senderId: driverId,
      };

      io.to(passengerId).emit('chat_updated', {
         chatId: chat.id,
         lastMessage: lastMessagePayload,
         unreadCount:
            chat.participant1Id === passengerId
               ? (chat as any).unreadCount1
               : (chat as any).unreadCount2,
      });

      io.to(driverId).emit('chat_updated', {
         chatId: chat.id,
         lastMessage: lastMessagePayload,
         unreadCount:
            chat.participant1Id === driverId
               ? (chat as any).unreadCount1
               : (chat as any).unreadCount2,
      });
   } catch (err) {
      logger.warn({ err, chatId: chat.id }, `${LOG_PREFIX} socket emit failed`);
   }

   createNotification({
      userId: passengerId,
      type: NotificationType.MESSAGES,
      translationKey: 'notification.new_message',
      translationParams: {
         senderName: driverName || 'Driver',
         content: text,
      },
      metadata: { chatId: chat.id },
   }).catch((err) =>
      logger.error(
         { err, chatId: chat.id },
         `${LOG_PREFIX} failed to create notification`,
      ),
   );

   return message;
};

export const processIncomingDriverMessage = async (
   payload: IncomingDriverChatDto,
): Promise<IncomingDriverChatResult> => {
   logger.info(
      {
         session: payload.sender_session,
         tg_user_id: payload.tg_user_id,
         tg_message_id: payload.tg_message_id,
         phone: payload.driver_phone,
         preview: payload.message.slice(0, 80),
      },
      `${LOG_PREFIX} IN ${payload.sender_session} <- ${payload.driver_phone} (uid=${payload.tg_user_id}, msg_id=${payload.tg_message_id})`,
   );

   const dedupKey = buildDedupKey(
      payload.sender_session,
      payload.tg_user_id,
      payload.tg_message_id,
   );

   const cached = await readDedup(dedupKey);
   if (cached) {
      logger.info(
         {
            session: payload.sender_session,
            tg_user_id: payload.tg_user_id,
            tg_message_id: payload.tg_message_id,
            chatId: cached.chatId,
            delivered: cached.deliveredToPassenger,
         },
         `${LOG_PREFIX} duplicate, returning cached result`,
      );
      return cached;
   }

   const driver = await findUserByPhoneNumber(payload.driver_phone);
   if (!driver || driver.role !== UserRole.Driver) {
      throw new BadRequestError('phone not registered as driver');
   }

   const text = truncateText(payload.message);

   const candidate = await pickActiveChatForDriver(driver.id);
   if (!candidate) {
      logger.info(
         {
            phone: payload.driver_phone,
            session: payload.sender_session,
            tg_user_id: payload.tg_user_id,
         },
         `${LOG_PREFIX} no active chat for ${payload.driver_phone}, dropped`,
      );
      const result: IncomingDriverChatResult = {
         chatId: null,
         deliveredToPassenger: false,
      };
      await writeDedup(dedupKey, result);
      return result;
   }

   await deliverMessageToChat(
      candidate.chat,
      driver.id,
      candidate.passengerId,
      driver.firstName,
      text,
   );

   const result: IncomingDriverChatResult = {
      chatId: candidate.chat.id,
      deliveredToPassenger: true,
   };
   await writeDedup(dedupKey, result);

   logger.info(
      {
         session: payload.sender_session,
         tg_user_id: payload.tg_user_id,
         tg_message_id: payload.tg_message_id,
         chatId: candidate.chat.id,
         driverPhone: payload.driver_phone,
         received_at: payload.received_at,
      },
      `${LOG_PREFIX} delivered to passenger`,
   );

   return result;
};
