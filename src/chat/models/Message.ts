import User from '../../user/models/User';
import Chat from './Chat';
import db from '../../../shared/config/database';
import { Model, DataTypes, Optional, Op } from 'sequelize';

export interface MessageAttributes {
   id: string;
   chatId: string;
   senderId: string;
   content?: string;
   mediaUrl?: string;
   isRead: boolean;
   // Клиентский идемпотентный ключ (WS `clientId`). NULL для сообщений,
   // созданных без него. Дедуп по паре (chatId, clientId) закрывает
   // дублирование при ретраях/реконнектах и на стыке WS↔REST.
   clientId?: string | null;
}

export type MessageCreationAttributes = Optional<
   MessageAttributes,
   'id' | 'isRead' | 'clientId'
>;

class Message
   extends Model<MessageAttributes, MessageCreationAttributes>
   implements MessageAttributes
{
   public id!: string;
   public chatId!: string;
   public senderId!: string;
   public content: string;
   public mediaUrl?: string;
   public isRead!: boolean;
   public clientId?: string | null;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Message.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      chatId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: Chat, key: 'id' },
         onDelete: 'CASCADE',
      },
      senderId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
      },
      content: {
         type: DataTypes.TEXT,
         allowNull: true, // Allow null if media is present
      },
      mediaUrl: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'media_url',
      },
      isRead: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      clientId: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'client_id',
      },
   },
   {
      sequelize: db,
      tableName: 'messages',
      timestamps: true,
      indexes: [
         {
            name: 'idx_messages_chat_created',
            fields: ['chatId', 'createdAt'],
         },
         {
            name: 'idx_messages_sender',
            fields: ['senderId'],
         },
         {
            name: 'idx_messages_unread',
            fields: ['chatId', 'isRead'],
            where: {
               isRead: false,
            },
         },
         // Идемпотентность (chatId, clientId): один и тот же клиентский ключ
         // в чате не создаёт вторую строку. Частичный индекс — только для
         // строк с clientId, чтобы NULL-и (REST без ключа) не конфликтовали.
         {
            name: 'idx_messages_chat_client_unique',
            unique: true,
            fields: ['chatId', 'client_id'],
            where: {
               client_id: { [Op.ne]: null },
            },
         },
      ],
   },
);

export default Message;
