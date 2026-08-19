import Admin from '../../auth/models/Admin';
import db from '../../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';

export enum AdminAction {
   // Session
   LOGIN = 'Начал сессию',
   LOGOUT = 'Завершил сессию',
   // Driver applications
   REVIEW_DRIVER_APP = 'Посмотрел заявки водителей',
   CHANGE_APP_STATUS = 'Изменил статус заявки',
   CHANGE_APP_DATA = 'Изменил данные заявки',
   // Reports
   VIEW_REPORTS = 'Посмотрел жалобы',
   CHANGE_REPORT_STATUS = 'Изменил статус жалобы',
   // Users
   BAN_USER = 'Забанил пользователя',
   UNBAN_USER = 'Разбанил пользователя',
   VIEW_USER_DETAILS = 'Открыл профиль пользователя',
   SEARCH_USERS = 'Искал пользователей',
   // Admins
   CREATE_ADMIN = 'Создал админа',
   DELETE_ADMIN = 'Удалил админа',
   UPDATE_ADMIN_PERMISSIONS = 'Обновил права доступа админа',
   // Trips
   EDIT_TRIP = 'Изменил поездку',
   DELETE_TRIP = 'Удалил поездку',
   CHANGE_TRIP_STATUS = 'Изменил статус поездки',
   CHANGE_BOOKING_STATUS = 'Изменил статус брони',
   // Notifications
   CREATE_GLOBAL_NOTIFICATION = 'Создал глобальное уведомление',
   // Moderation
   ADD_RESTRICTED_WORD = 'Добавил цензурное слово',
   DELETE_RESTRICTED_WORD = 'Удалил цензурное слово',
   // Blog
   CREATE_BLOG = 'Создал статью в блоге',
   UPDATE_BLOG = 'Обновил статью в блоге',
   DELETE_BLOG = 'Удалил статью из блога',
   // Promocodes
   CREATE_PROMOCODE = 'Создал промокод',
   DELETE_PROMOCODE = 'Удалил промокод',
}

export enum AdminLogCategory {
   SESSION = 'SESSION',
   USERS = 'USERS',
   TRIPS = 'TRIPS',
   REPORTS = 'REPORTS',
   APPLICATIONS = 'APPLICATIONS',
   ADMINS = 'ADMINS',
   NOTIFICATIONS = 'NOTIFICATIONS',
   MODERATION = 'MODERATION',
   BLOG = 'BLOG',
   PROMOCODES = 'PROMOCODES',
   OTHER = 'OTHER',
}

export enum AdminLogEntityType {
   USER = 'USER',
   TRIP = 'TRIP',
   BOOKING = 'BOOKING',
   REPORT = 'REPORT',
   DRIVER_APPLICATION = 'DRIVER_APPLICATION',
   ADMIN = 'ADMIN',
   NOTIFICATION = 'NOTIFICATION',
   BLOG = 'BLOG',
   RESTRICTED_WORD = 'RESTRICTED_WORD',
   PROMOCODE = 'PROMOCODE',
}

const ACTION_CATEGORY_MAP: Record<AdminAction, AdminLogCategory> = {
   [AdminAction.LOGIN]: AdminLogCategory.SESSION,
   [AdminAction.LOGOUT]: AdminLogCategory.SESSION,
   [AdminAction.REVIEW_DRIVER_APP]: AdminLogCategory.APPLICATIONS,
   [AdminAction.CHANGE_APP_STATUS]: AdminLogCategory.APPLICATIONS,
   [AdminAction.VIEW_REPORTS]: AdminLogCategory.REPORTS,
   [AdminAction.CHANGE_REPORT_STATUS]: AdminLogCategory.REPORTS,
   [AdminAction.CHANGE_APP_DATA]: AdminLogCategory.APPLICATIONS,
   [AdminAction.BAN_USER]: AdminLogCategory.USERS,
   [AdminAction.UNBAN_USER]: AdminLogCategory.USERS,
   [AdminAction.VIEW_USER_DETAILS]: AdminLogCategory.USERS,
   [AdminAction.SEARCH_USERS]: AdminLogCategory.USERS,
   [AdminAction.CREATE_ADMIN]: AdminLogCategory.ADMINS,
   [AdminAction.DELETE_ADMIN]: AdminLogCategory.ADMINS,
   [AdminAction.UPDATE_ADMIN_PERMISSIONS]: AdminLogCategory.ADMINS,
   [AdminAction.EDIT_TRIP]: AdminLogCategory.TRIPS,
   [AdminAction.DELETE_TRIP]: AdminLogCategory.TRIPS,
   [AdminAction.CHANGE_TRIP_STATUS]: AdminLogCategory.TRIPS,
   [AdminAction.CHANGE_BOOKING_STATUS]: AdminLogCategory.TRIPS,
   [AdminAction.CREATE_GLOBAL_NOTIFICATION]: AdminLogCategory.NOTIFICATIONS,
   [AdminAction.ADD_RESTRICTED_WORD]: AdminLogCategory.MODERATION,
   [AdminAction.DELETE_RESTRICTED_WORD]: AdminLogCategory.MODERATION,
   [AdminAction.CREATE_BLOG]: AdminLogCategory.BLOG,
   [AdminAction.UPDATE_BLOG]: AdminLogCategory.BLOG,
   [AdminAction.DELETE_BLOG]: AdminLogCategory.BLOG,
   [AdminAction.CREATE_PROMOCODE]: AdminLogCategory.PROMOCODES,
   [AdminAction.DELETE_PROMOCODE]: AdminLogCategory.PROMOCODES,
};

export const getActionCategory = (action: AdminAction): AdminLogCategory =>
   ACTION_CATEGORY_MAP[action] ?? AdminLogCategory.OTHER;

export interface EntitySnapshot {
   label?: string;
   subLabel?: string;
   meta?: Record<string, unknown>;
}

export interface AdminLogAttributes {
   id: string;
   adminId: string;
   action: AdminAction;
   category: AdminLogCategory;
   adminName?: string | null;
   details?: string | null;
   timestamp?: Date;
   relatedEntityId?: string | null;
   relatedEntityType?: AdminLogEntityType | string | null;
   entitySnapshot?: EntitySnapshot | null;
   metadata?: Record<string, unknown> | null;
   ipAddress?: string | null;
   userAgent?: string | null;
   sessionId?: string | null;
   isReverted?: boolean;
   revertedBy?: string | null;
   revertedAt?: Date | null;
}

export type AdminLogCreationAttributes = Optional<
   AdminLogAttributes,
   'id' | 'timestamp' | 'isReverted' | 'revertedBy' | 'revertedAt' | 'category'
>;

class AdminLog
   extends Model<AdminLogAttributes, AdminLogCreationAttributes>
   implements AdminLogAttributes
{
   public id!: string;
   public adminId!: string;
   public action!: AdminAction;
   public category!: AdminLogCategory;
   public adminName?: string | null;
   public details?: string | null;
   public readonly timestamp!: Date;
   public relatedEntityId?: string | null;
   public relatedEntityType?: AdminLogEntityType | string | null;
   public entitySnapshot?: EntitySnapshot | null;
   public metadata?: Record<string, unknown> | null;
   public ipAddress?: string | null;
   public userAgent?: string | null;
   public sessionId?: string | null;
   public isReverted!: boolean;
   public revertedBy?: string | null;
   public revertedAt?: Date | null;
}

AdminLog.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      adminId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: Admin, key: 'id' },
         field: 'admin_id',
      },
      action: {
         type: DataTypes.ENUM(...Object.values(AdminAction)),
         allowNull: false,
      },
      category: {
         type: DataTypes.ENUM(...Object.values(AdminLogCategory)),
         allowNull: false,
         defaultValue: AdminLogCategory.OTHER,
      },
      adminName: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'admin_name',
      },
      details: {
         type: DataTypes.TEXT,
         allowNull: true,
      },
      timestamp: {
         type: DataTypes.DATE,
         defaultValue: DataTypes.NOW,
         allowNull: false,
      },
      relatedEntityId: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'related_entity_id',
      },
      relatedEntityType: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'related_entity_type',
      },
      entitySnapshot: {
         type: DataTypes.JSONB,
         allowNull: true,
         field: 'entity_snapshot',
      },
      metadata: {
         type: DataTypes.JSONB,
         allowNull: true,
      },
      ipAddress: {
         type: DataTypes.STRING(64),
         allowNull: true,
         field: 'ip_address',
      },
      userAgent: {
         type: DataTypes.STRING(512),
         allowNull: true,
         field: 'user_agent',
      },
      sessionId: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'session_id',
      },
      isReverted: {
         type: DataTypes.BOOLEAN,
         defaultValue: false,
         field: 'is_reverted',
      },
      revertedBy: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: Admin, key: 'id' },
         field: 'reverted_by',
      },
      revertedAt: {
         type: DataTypes.DATE,
         allowNull: true,
         field: 'reverted_at',
      },
   },
   {
      sequelize: db,
      tableName: 'admin_logs',
      timestamps: false,
      indexes: [
         {
            name: 'idx_admin_logs_admin_timestamp',
            fields: ['admin_id', 'timestamp'],
         },
         { name: 'idx_admin_logs_category', fields: ['category'] },
         {
            name: 'idx_admin_logs_entity',
            fields: ['related_entity_type', 'related_entity_id'],
         },
         { name: 'idx_admin_logs_session', fields: ['session_id'] },
      ],
   },
);

export default AdminLog;
