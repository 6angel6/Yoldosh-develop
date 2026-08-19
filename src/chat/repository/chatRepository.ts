import Chat from '../models/Chat';
import Message from '../models/Message';
import User from '../../user/models/User';
import Trip, { TripStatus } from '../../trips/models/Trip';
import Booking from '../../booking/models/Booking';
import { Op, Transaction } from 'sequelize';

export interface CreateChatData {
    tripId: string;
    participant1Id: string;
    participant2Id: string;
}

export interface CreateMessageData {
    chatId: string;
    senderId: string;
    content?: string;
    mediaUrl?: string;
    clientId?: string | null;
}

export const findChatByTripAndParticipants = async (
    tripId: string,
    participant1Id: string,
    participant2Id: string,
    transaction?: Transaction,
): Promise<Chat | null> => {
    const queryOptions: any = {
        where: {
            tripId,
            [Op.or]: [
                { participant1Id, participant2Id },
                { participant1Id: participant2Id, participant2Id: participant1Id },
            ],
        },
    };

    if (transaction) {
        queryOptions.transaction = transaction;
    }

    return await Chat.findOne(queryOptions);
};

export const createChat = async (
    data: CreateChatData,
    transaction?: Transaction,
): Promise<Chat> => {
    return await Chat.create(data, { transaction });
};

export const findChatById = async (
    chatId: string,
    transaction?: Transaction,
): Promise<Chat | null> => {
    const queryOptions: any = {};

    if (transaction) {
        queryOptions.transaction = transaction;
    }

    return await Chat.findByPk(chatId, queryOptions);
};

export const createMessage = async (
    data: CreateMessageData,
    transaction?: Transaction,
): Promise<Message> => {
    return await Message.create(data, { transaction });
};

export const findMessageByChatAndClientId = async (
    chatId: string,
    clientId: string,
    transaction?: Transaction,
): Promise<Message | null> => {
    return await Message.findOne({
        where: { chatId, clientId },
        include: [{ model: User, as: 'sender', attributes: ['id', 'firstName'] }],
        transaction,
    });
};

// Помечает прочитанными конкретные сообщения собеседника (senderId != reader).
// Возвращает число затронутых строк.
export const markMessagesReadByIds = async (
    chatId: string,
    readerId: string,
    messageIds: string[],
    transaction?: Transaction,
): Promise<number> => {
    if (messageIds.length === 0) return 0;
    const [affected] = await Message.update(
        { isRead: true },
        {
            where: {
                chatId,
                id: { [Op.in]: messageIds },
                senderId: { [Op.ne]: readerId },
                isRead: false,
            },
            transaction,
        },
    );
    return affected;
};

export const saveChat = async (
    chat: Chat,
    transaction?: Transaction,
): Promise<Chat> => {
    return await chat.save({ transaction });
};

export const updateMessageContent = async (
    messageId: string,
    content: string,
    transaction?: Transaction,
): Promise<void> => {
    await Message.update({ content }, { where: { id: messageId }, transaction });
};

export const markMessagesReadByRecipient = async (
    chatId: string,
    recipientId: string,
    transaction?: Transaction,
): Promise<void> => {
    await Message.update(
        { isRead: true },
        {
            where: {
                chatId,
                senderId: { [Op.ne]: recipientId },
                isRead: false,
            },
            transaction,
        },
    );
};

export const findActiveChatsWithTripByUser = async (
    userId: string,
): Promise<Chat[]> => {
    return await Chat.findAll({
        where: {
            [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        },
        include: [
            {
                model: Trip,
                as: 'trip',
                required: true,
                where: {
                    status: {
                        [Op.ne]: TripStatus.Canceled,
                    },
                },
                attributes: ['id', 'status'],
            },
        ],
    });
};

export const findLastMessageByChatAndSender = async (
    chatId: string,
    senderId: string,
): Promise<Message | null> => {
    return await Message.findOne({
        where: { chatId, senderId },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt'],
    });
};

export const findMessagesByChatId = async (
    chatId: string,
): Promise<Message[]> => {
    return await Message.findAll({
        where: { chatId },
        order: [['createdAt', 'ASC']],
        include: [{ model: User, as: 'sender', attributes: ['id', 'firstName'] }],
    });
};

export const findChatsByUserId = async (userId: string): Promise<Chat[]> => {
    // Пустой чат (создан через startChat, но ни одного сообщения ещё не
    // было) не должен долетать до сервиса. Делаем это на уровне SQL, а не
    // JS-фильтром после выборки — но БЕЗ raw-SQL с ручными именами колонок:
    // атрибут 'chatId' у модели Message сам маппится Sequelize'ом на
    // реальную колонку, какая бы конвенция (camelCase/snake_case) там ни
    // была настроена — так безопаснее, чем угадывать имя колонки в raw SQL.

    // 1) Чаты, где userId — участник (дешёвый индексируемый запрос)
    const userChatRows = (await Chat.findAll({
        where: {
            [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        },
        attributes: ['id'],
        raw: true,
    })) as unknown as Array<{ id: string }>;
    const userChatIds = userChatRows.map((r) => r.id);

    if (userChatIds.length === 0) return [];

    // 2) Из них — те, где есть хотя бы одно сообщение
    const chatIdsWithMessagesRows = (await Message.findAll({
        where: { chatId: { [Op.in]: userChatIds } },
        attributes: ['chatId'],
        group: ['chatId'],
        raw: true,
    })) as unknown as Array<{ chatId: string }>;
    const chatIdsWithMessages = chatIdsWithMessagesRows.map((r) => r.chatId);

    if (chatIdsWithMessages.length === 0) return [];

    return await Chat.findAll({
        where: {
            id: { [Op.in]: chatIdsWithMessages },
        },
        include: [
            {
                model: User,
                as: 'participant1',
                attributes: ['id', 'firstName', 'avatar', 'registration_source'],
            },
            {
                model: User,
                as: 'participant2',
                attributes: ['id', 'firstName', 'avatar', 'registration_source'],
            },
            {
                model: Message,
                as: 'messages',
                limit: 1,
                order: [['createdAt', 'DESC']],
                attributes: [
                    'id',
                    'content',
                    'mediaUrl',
                    'createdAt',
                    'isRead',
                    'senderId',
                ],
            },
        ],
        order: [['updatedAt', 'DESC']],
    });
};

export const findChatWithTripDetails = async (
    chatId: string,
): Promise<Chat | null> => {
    return await Chat.findByPk(chatId, {
        include: [
            {
                model: Trip,
                as: 'trip',
                attributes: [
                    'id',
                    'driver_id',
                    'departure_ts',
                    'from_address',
                    'to_address',
                    'from_city',
                    'to_city',
                ],
                include: [
                    {
                        model: User,
                        as: 'driver',
                        attributes: ['id', 'firstName', 'lastName', 'avatar'],
                    },
                    {
                        model: Booking,
                        as: 'bookings',
                        attributes: ['passengerId', 'seatsBooked', 'status'],
                    },
                ],
            },
        ],
    });
};