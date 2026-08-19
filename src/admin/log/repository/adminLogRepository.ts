import { Op, Sequelize, Transaction, WhereOptions } from 'sequelize';
import AdminLog, {
   AdminLogCreationAttributes,
   AdminAction,
   AdminLogCategory,
} from '../models/AdminLog';

export const createLog = async (
   logData: AdminLogCreationAttributes,
): Promise<AdminLog> => {
   return await AdminLog.create(logData);
};

export interface LogQueryOptions {
   limit: number;
   offset: number;
   search?: string;
   sortBy: string;
   sortOrder: string;
   startDate?: string;
   endDate?: string;
   category?: AdminLogCategory | string;
   action?: AdminAction | string;
   entityType?: string;
   entityId?: string;
   adminIds?: string[];
}

const buildWhere = (
   options: LogQueryOptions,
   base: WhereOptions = {},
): WhereOptions => {
   const where: any = { ...base };

   if (options.search) {
      where[Op.or] = [
         { action: { [Op.iLike]: `%${options.search}%` } },
         { details: { [Op.iLike]: `%${options.search}%` } },
         { admin_name: { [Op.iLike]: `%${options.search}%` } },
         { related_entity_id: { [Op.iLike]: `%${options.search}%` } },
      ];
   }

   if (options.startDate && options.endDate) {
      const start = new Date(options.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
         where.timestamp = { [Op.between]: [start, end] };
      }
   } else if (options.startDate) {
      const start = new Date(options.startDate);
      if (!isNaN(start.getTime())) where.timestamp = { [Op.gte]: start };
   } else if (options.endDate) {
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);
      if (!isNaN(end.getTime())) where.timestamp = { [Op.lte]: end };
   }

   if (options.category) where.category = options.category;
   if (options.action) where.action = options.action;
   if (options.entityType) where.relatedEntityType = options.entityType;
   if (options.entityId) where.relatedEntityId = options.entityId;
   if (options.adminIds && options.adminIds.length > 0)
      where.adminId = { [Op.in]: options.adminIds };

   return where;
};

export const findLogsByAdminId = async (
   adminId: string,
   options: LogQueryOptions,
): Promise<{ rows: AdminLog[]; count: number }> => {
   const where = buildWhere(options, { adminId });
   return await AdminLog.findAndCountAll({
      where,
      limit: options.limit,
      offset: options.offset,
      order: [[options.sortBy, options.sortOrder]],
   });
};

export const findAllLogs = async (
   options: LogQueryOptions,
): Promise<{ rows: AdminLog[]; count: number }> => {
   const where = buildWhere(options);
   return await AdminLog.findAndCountAll({
      where,
      limit: options.limit,
      offset: options.offset,
      order: [[options.sortBy, options.sortOrder]],
   });
};

export const findLogById = async (
   logId: string,
   transaction?: Transaction,
): Promise<AdminLog | null> => {
   return await AdminLog.findByPk(logId, { transaction });
};

/** Сводная статистика действий админа: counter-ы по категории и action-у. */
export const getAdminActionStats = async (
   adminId: string,
   startDate?: Date,
   endDate?: Date,
) => {
   const where: any = { adminId };
   if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp[Op.gte] = startDate;
      if (endDate) where.timestamp[Op.lte] = endDate;
   }

   const [byCategory, byAction, total, lastAction, firstAction] =
      await Promise.all([
         AdminLog.findAll({
            where,
            attributes: [
               'category',
               [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            ],
            group: ['category'],
            raw: true,
         }),
         AdminLog.findAll({
            where,
            attributes: [
               'action',
               [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            ],
            group: ['action'],
            order: [[Sequelize.literal('count'), 'DESC']],
            raw: true,
            limit: 20,
         }),
         AdminLog.count({ where }),
         AdminLog.findOne({
            where,
            order: [['timestamp', 'DESC']],
         }),
         AdminLog.findOne({
            where,
            order: [['timestamp', 'ASC']],
         }),
      ]);

   return {
      total,
      byCategory: (byCategory as any[]).map((r) => ({
         category: r.category,
         count: parseInt(r.count, 10),
      })),
      byAction: (byAction as any[]).map((r) => ({
         action: r.action,
         count: parseInt(r.count, 10),
      })),
      firstActionAt: firstAction?.timestamp ?? null,
      lastActionAt: lastAction?.timestamp ?? null,
   };
};

/** Парные login/logout для построения таймлайна сессий. */
export const getSessionTimeline = async (adminId: string, limit: number) => {
   return AdminLog.findAll({
      where: {
         adminId,
         action: { [Op.in]: [AdminAction.LOGIN, AdminAction.LOGOUT] },
      },
      order: [['timestamp', 'DESC']],
      limit,
   });
};
