import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import User from '../../user/models/User';
import Trip from '../../trips/models/Trip';

export interface ChatAttributes {
   id: string;
   tripId: string;
   participant1Id: string;
   participant2Id: string;
   unreadCount1: number;
   unreadCount2: number;
}

export type ChatCreationAttributes = Optional<ChatAttributes, 'id'>;

class Chat
   extends Model<ChatAttributes, ChatCreationAttributes>
   implements ChatAttributes
{
   public id!: string;
   public tripId!: string;
   public participant1Id!: string;
   public participant2Id!: string;
   public unreadCount1: number;
   public unreadCount2: number;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Chat.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      tripId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: Trip, key: 'id' },
         onDelete: 'CASCADE',
      },
      participant1Id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
      },
      participant2Id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
      },
      unreadCount1: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 0,
         field: 'unread_count_1',
      },
      unreadCount2: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 0,
         field: 'unread_count_2',
      },
   },
   {
      sequelize: db,
      tableName: 'chats',
      timestamps: true,
      indexes: [
         {
            name: 'idx_chats_trip',
            fields: ['tripId'],
         },
         {
            name: 'idx_chats_participant1',
            fields: ['participant1Id', 'updatedAt'],
         },
         {
            name: 'idx_chats_participant2',
            fields: ['participant2Id', 'updatedAt'],
         },
         {
            unique: true,
            name: 'idx_chats_trip_participants_unique',
            fields: ['tripId', 'participant1Id', 'participant2Id'],
         },
      ],
   },
);

export default Chat;
