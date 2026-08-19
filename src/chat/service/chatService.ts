import Chat from '../models/Chat';
import Message from '../models/Message';

import { getIO } from '../../../shared/config/socket';
import { createNotification } from './notificationService';
import { NotificationType } from '../models/Notification';
import { filterMessageContent } from '../../../shared/utils/filter';
import {
    findChatsByUserId,
    findChatWithTripDetails,
    findMessagesByChatId,
    findChatByTripAndParticipants,
    createChat,
    findChatById,
    createMessage,
    saveChat,
    updateMessageContent,
    markMessagesReadByRecipient,
    markMessagesReadByIds,
    findMessageByChatAndClientId,
} from '../repository/chatRepository';
import * as tripRepository from '../../trips/repository/tripRepository';
import { BookingStatus } from '../../booking/models/Booking';
import {
    isUserBlocked,
    getBlockedUserIds,
} from '../../user/repository/userRepository';
import {
    ForbiddenError,
    NotFoundError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import { checkModeration } from './moderation';
import logger from '../../../shared/utils/logger';
import { publishExternalDriverChatNotification } from '../../workers/queues/externalDriverQueue';
import * as userRepository from '../../user/repository/userRepository';
import { RegistrationSource } from '../../user/models/User';

export const getOrCreateChat = async (
    tripId: string,
    participant1Id: string,
    participant2Id: string,
): Promise<Chat> => {
    let chat = await findChatByTripAndParticipants(
        tripId,
        participant1Id,
        participant2Id,
    );

    if (!chat) {
        const blocked = await isUserBlocked(participant1Id, participant2Id);
        if (blocked) {
            throw new ForbiddenError('Cannot start a chat with this user.');
        }
        chat = await createChat({
            tripId,
            participant1Id,
            participant2Id,
        });
    }

    return chat;
};

export const sendMessage = async (
    chatId: string,
    senderId: string,
    content?: string,
    mediaUrl?: string,
    senderName?: string,
    clientId?: string | null,
): Promise<Message> => {
    // Идемпотентность (chatId, clientId): повтор с тем же ключом (ретрай,
    // реконнект или дубль на стыке WS↔REST) не создаёт вторую строку —
    // возвращаем уже существующее сообщение, чтобы его повторно за-ack-нуть.
    if (clientId) {
        const existing = await findMessageByChatAndClientId(chatId, clientId);
        if (existing) return existing;
    }

    const chat = await findChatById(chatId);
    if (!chat) {
        throw new NotFoundError('Chat not found.', ErrorCode.CHAT_NOT_FOUND);
    }

    const isParticipant =
        chat.participant1Id === senderId || chat.participant2Id === senderId;
    if (!isParticipant) {
        throw new ForbiddenError(
            'User is not a participant in this chat.',
            ErrorCode.CHAT_ACCESS_DENIED,
        );
    }

    const recipientId =
        chat.participant1Id === senderId
            ? chat.participant2Id
            : chat.participant1Id;

    const blocked = await isUserBlocked(senderId, recipientId);
    if (blocked) {
        throw new ForbiddenError('You cannot send messages to this user.');
    }

    const safeContent = content ? await filterMessageContent(content) : content;

    let message: Message;
    try {
        message = await createMessage({
            chatId,
            senderId,
            content: safeContent,
            mediaUrl,
            clientId: clientId ?? null,
        });
    } catch (err: any) {
        // Гонка check-then-insert: два параллельных инсерта с одним clientId.
        // Частичный UNIQUE-индекс отбивает второй — возвращаем победителя.
        if (clientId && err?.name === 'SequelizeUniqueConstraintError') {
            const existing = await findMessageByChatAndClientId(chatId, clientId);
            if (existing) return existing;
        }
        throw err;
    }

    if (chat && (chat as any).tripId) {
        const tripId = (chat as any).tripId;

        tripRepository
            .findTripById(tripId)
            .then(async (trip) => {
                if (!trip) return;

                const driverId = trip.driver_id;
                if (senderId === driverId) return;

                const driver = await userRepository.findUserById(driverId);
                if (!driver || !driver.phoneNumber) return;
                if (driver.registration_source !== RegistrationSource.FromBot)
                    return;

                await publishExternalDriverChatNotification({
                    event: 'driver.notification.chat',
                    data: {
                        trip_id: tripId,
                        driver_phone: driver.phoneNumber,
                        chat_id: chatId,
                        passenger_id: senderId,
                        from_city: trip.from_city,
                        to_city: trip.to_city,
                        price: Number(trip.price_per_person),
                        message: safeContent || '📷 Изображение',
                    },
                });
            })
            .catch((err) =>
                logger.error(
                    { err },
                    'Error checking external trip for chat notification',
                ),
            );
    }

    if (chat) {
        if (chat.participant1Id === senderId) {
            (chat as any).unreadCount2 += 1;
        } else {
            (chat as any).unreadCount1 += 1;
        }
        await saveChat(chat);

        const recipientId =
            chat.participant1Id === senderId
                ? chat.participant2Id
                : chat.participant1Id;

        const io = getIO();
        io.to(recipientId).emit('new_message', message);

        const lastMessagePayload = {
            content: safeContent || (mediaUrl ? '📷 Photo/Video' : ''),
            createdAt: message.createdAt,
            isRead: false,
            senderId,
        };

        // Обновление списка чатов в реалтайме (как в Telegram) — для обоих участников
        io.to(recipientId).emit('chat_updated', {
            chatId: chat.id,
            lastMessage: lastMessagePayload,
            unreadCount:
                chat.participant1Id === recipientId
                    ? (chat as any).unreadCount1
                    : (chat as any).unreadCount2,
        });

        io.to(senderId).emit('chat_updated', {
            chatId: chat.id,
            lastMessage: lastMessagePayload,
            unreadCount:
                chat.participant1Id === senderId
                    ? (chat as any).unreadCount1
                    : (chat as any).unreadCount2,
        });

        if (safeContent && safeContent.trim().length > 0) {
            checkModeration(safeContent)
                .then(async (modResult) => {
                    let finalContent = safeContent;

                    if (modResult?.flagged === true) {
                        const censoredContent = '*******';

                        await updateMessageContent(message.id, censoredContent);

                        const updatedMessage = {
                            ...message.toJSON(),
                            content: censoredContent,
                            moderated: true,
                        };

                        io.to(senderId).emit('message_updated', updatedMessage);
                        io.to(recipientId).emit('message_updated', updatedMessage);

                        finalContent = censoredContent;

                        logger.info(
                            { messageId: message.id, reason: modResult.reason },
                            'Message censored',
                        );
                    }

                    createNotification({
                        userId: recipientId,
                        type: NotificationType.MESSAGES,
                        translationKey: 'notification.new_message',
                        translationParams: {
                            senderName: senderName || 'User',
                            content: finalContent,
                        },
                        metadata: { chatId },
                    }).catch((err) =>
                        logger.warn({ err }, 'Failed to create notification'),
                    );
                })
                .catch((err) => {
                    logger.warn({ err }, 'Background moderation failed');
                    createNotification({
                        userId: recipientId,
                        type: NotificationType.MESSAGES,
                        translationKey: 'notification.new_message',
                        translationParams: {
                            senderName: senderName || 'User',
                            content: safeContent,
                        },
                        metadata: { chatId },
                    }).catch((notifErr) =>
                        logger.warn(
                            { err: notifErr },
                            'Failed to create notification',
                        ),
                    );
                });
        } else {
            createNotification({
                userId: recipientId,
                type: NotificationType.MESSAGES,
                translationKey: 'notification.new_message',
                translationParams: {
                    senderName: senderName || 'User',
                    content: 'attachment',
                },
                metadata: { chatId },
            }).catch((err) =>
                logger.warn({ err }, 'Failed to create notification'),
            );
        }
    }

    return message;
};

export const getChatMessages = async (
    chatId: string,
    userId: string,
): Promise<any> => {
    const chatWithTrip = await findChatWithTripDetails(chatId);

    if (!chatWithTrip) {
        throw new NotFoundError('Chat not found.', ErrorCode.CHAT_NOT_FOUND);
    }

    const isParticipant =
        chatWithTrip.participant1Id === userId ||
        chatWithTrip.participant2Id === userId;
    if (!isParticipant) {
        throw new ForbiddenError(
            'User is not a participant in this chat.',
            ErrorCode.CHAT_ACCESS_DENIED,
        );
    }

    const otherParticipantId =
        chatWithTrip.participant1Id === userId
            ? chatWithTrip.participant2Id
            : chatWithTrip.participant1Id;

    const blocked = await isUserBlocked(userId, otherParticipantId);
    if (blocked) {
        throw new ForbiddenError('You cannot view messages from this user.');
    }

    await markMessagesReadByRecipient(chatId, userId);

    if (chatWithTrip.participant1Id === userId) {
        (chatWithTrip as any).unreadCount1 = 0;
    } else {
        (chatWithTrip as any).unreadCount2 = 0;
    }
    await saveChat(chatWithTrip);

    const messages = await findMessagesByChatId(chatId);

    const trip = (chatWithTrip as any).trip;
    let passengerCount = 0;

    if (trip) {
        const passengerId =
            trip.driver_id === chatWithTrip.participant1Id
                ? chatWithTrip.participant2Id
                : chatWithTrip.participant1Id;

        const booking = trip.bookings?.find(
            (b: any) =>
                b.passengerId === passengerId &&
                b.status !== BookingStatus.CANCELLED,
        );

        passengerCount = booking ? booking.seatsBooked : 0;
    }

    return {
        trip: trip
            ? {
                tripid: trip.id,
                from_address: trip.from_address,
                to_address: trip.to_address,
                from_city: trip.from_city,
                to_city: trip.to_city,
                date: trip.departure_ts,
                passengerCount: passengerCount, // Кол-во мест, которые забронировал этот человек
                driver: {
                    id: trip.driver?.id,
                    firstName: trip.driver?.firstName,
                    lastName: trip.driver?.lastName,
                    avatar: trip.driver?.avatar,
                },
            }
            : null,
        messages: messages,
    };
};

/**
 * Возвращает чат, если пользователь — его участник, иначе null.
 * Используется WS-слоем для скоупинга подписки и вычисления собеседника
 * без «протечки» ошибок наружу (в реалтайме нет HTTP-ответа).
 */
export const getChatForParticipant = async (
    chatId: string,
    userId: string,
): Promise<Chat | null> => {
    const chat = await findChatById(chatId);
    if (!chat) return null;
    const isParticipant =
        chat.participant1Id === userId || chat.participant2Id === userId;
    return isParticipant ? chat : null;
};

/**
 * Обрабатывает `message.read`: помечает прочитанными сообщения собеседника
 * и обнуляет счётчик непрочитанного читателя (парити с GET /api/v1/chat).
 * `messageIds` пуст → «прочитано всё» (все входящие в чате). Возвращает id
 * собеседника для рассылки `message.read`, либо null если доступа нет.
 */
export const markChatRead = async (
    chatId: string,
    readerId: string,
    messageIds: string[],
): Promise<string | null> => {
    const chat = await findChatById(chatId);
    if (!chat) return null;

    const isParticipant =
        chat.participant1Id === readerId || chat.participant2Id === readerId;
    if (!isParticipant) return null;

    if (messageIds.length > 0) {
        await markMessagesReadByIds(chatId, readerId, messageIds);
    } else {
        await markMessagesReadByRecipient(chatId, readerId);
    }

    if (chat.participant1Id === readerId) {
        (chat as any).unreadCount1 = 0;
    } else {
        (chat as any).unreadCount2 = 0;
    }
    await saveChat(chat);

    return chat.participant1Id === readerId
        ? chat.participant2Id
        : chat.participant1Id;
};

export const getUserChats = async (userId: string): Promise<any[]> => {
    const chats = await findChatsByUserId(userId);

    const blockedUserIds = await getBlockedUserIds(userId);

    return chats
        .map((chat) => {
            const plainChat = chat.get({ plain: true }) as any;
            const messages = plainChat.messages || [];
            const lastMsg = messages.length > 0 ? messages[0] : null;

            const otherParticipantId =
                plainChat.participant1Id === userId
                    ? plainChat.participant2Id
                    : plainChat.participant1Id;

            // Удаляем массив messages, чтобы не засорять ответ, оставляем только lastMessage
            delete (plainChat as any).messages;

            return {
                ...plainChat,
                isBlocked: blockedUserIds.includes(otherParticipantId),
                lastMessage: lastMsg
                    ? {
                        content:
                            lastMsg.content ||
                            (lastMsg.mediaUrl ? '📷 Photo/Video' : ''),
                        createdAt: lastMsg.createdAt,
                        isRead: lastMsg.isRead,
                        senderId: lastMsg.senderId,
                    }
                    : null,
            };
        })
        // Чат без единого сообщения (создан через startChat, но ещё не
        // использован) не должен показываться в списке — только когда кто-то
        // из участников реально написал первое сообщение.
        .filter((chat) => chat.lastMessage !== null);
};