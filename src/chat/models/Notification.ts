import User from '../../user/models/User';
import db from '../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';

export enum NotificationType {
   RATING = 'rating',
   TRIPS = 'trips',
   BOOKING = 'booking',
   PAYMENT = 'payment',
   NEWS_AND_AGREEMENT = 'newsAndAgreement',
   PROMOTION_AND_DISCOUNTS = 'promotionAndDiscounts',
   MESSAGES = 'messages',
   GENERAL = 'general',
   SYSTEM = 'system', // For test and system notifications
}

export enum NotificationAudience {
   ALL = 'ALL',
   DRIVERS = 'DRIVERS',
   PASSENGERS = 'PASSENGERS',
}

export interface NotificationAttributes {
   id: string;
   userId: string;
   title: string;
   message: string;
   isRead: boolean;
   type: NotificationType;
   isGlobal?: boolean;
   targetAudience?: NotificationAudience;
   image?: string | null;

   createdAt?: Date;
   updatedAt?: Date;
}

export type NotificationCreationAttributes = Optional<
   NotificationAttributes,
   'id' | 'isRead'
>;

class Notification
   extends Model<NotificationAttributes, NotificationCreationAttributes>
   implements NotificationAttributes
{
   public id!: string;
   public userId!: string;
   public title!: string;
   public message!: string;
   public isRead!: boolean;
   public type!: NotificationType;
   public isGlobal!: boolean;
   public targetAudience!: NotificationAudience;
   public image?: string | null;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Notification.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      userId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: User, key: 'id' },
      },
      title: {
         type: DataTypes.STRING,
         allowNull: false,
         defaultValue: 'Уведомление',
      },
      message: {
         type: DataTypes.STRING,
         allowNull: false,
      },
      isRead: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      type: {
         type: DataTypes.ENUM(...Object.values(NotificationType)),
         allowNull: false,
         defaultValue: NotificationType.GENERAL,
      },
      isGlobal: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
         field: 'is_global',
      },
      targetAudience: {
         type: DataTypes.ENUM(...Object.values(NotificationAudience)),
         allowNull: true,
         field: 'target_audience',
      },
      image: {
         type: DataTypes.STRING,
         allowNull: true,
      },
   },
   {
      sequelize: db,
      tableName: 'notifications',
      timestamps: true,
   },
);

export default Notification;
