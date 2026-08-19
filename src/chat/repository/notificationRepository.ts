import Notification, {
   NotificationCreationAttributes,
} from '../models/Notification';
import { Transaction, Op, Sequelize } from 'sequelize';

export const createNotification = async (
   data: NotificationCreationAttributes,
   transaction?: Transaction,
): Promise<Notification> => {
   return await Notification.create(data, { transaction });
};

export const findNotificationsByUserId = async (
   userId: string,
   limit?: number,
): Promise<Notification[]> => {
   return await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
   });
};

export const markAllReadByUser = async (
   userId: string,
   transaction?: Transaction,
): Promise<void> => {
   await Notification.update(
      { isRead: true },
      { where: { userId, isRead: false }, transaction },
   );
};

export const findNotificationByIdAndUserId = async (
   notificationId: string,
   userId: string,
   transaction?: Transaction,
): Promise<Notification | null> => {
   const queryOptions: any = {
      where: { id: notificationId, userId },
   };
   if (transaction) {
      queryOptions.transaction = transaction;
   }

   return await Notification.findOne(queryOptions);
};

export const saveNotification = async (
   notification: Notification,
   transaction?: Transaction,
): Promise<Notification> => {
   return await notification.save({ transaction });
};

export const findGlobalNotifications = async (params: {
   limit: number;
   offset: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   startDate?: string;
   endDate?: string;
}) => {
   const { limit, offset, sortBy, sortOrder, search, startDate, endDate } =
      params;

   const whereClause: any = { isGlobal: true };

   if (search) {
      whereClause[Op.or] = [
         { message: { [Op.iLike]: `%${search}%` } },
         { title: { [Op.iLike]: `%${search}%` } },
      ];
   }

   if (startDate && endDate) {
      whereClause.createdAt = {
         [Op.between]: [new Date(startDate), new Date(endDate)],
      };
   }

   const notifications = await Notification.findAll({
      where: whereClause,
      attributes: [
         'title',
         'message',
         'type',
         'targetAudience',
         [Sequelize.fn('MIN', Sequelize.col('createdAt')), 'createdAt'],
      ],
      group: ['title', 'message', 'type', 'targetAudience'],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
      raw: true,
   });

   const total = await Notification.count({
      where: whereClause,
      distinct: true,
      col: 'message',
   });

   return { rows: notifications, count: total };
};
