import Admin, { AdminRole } from '../../auth/models/Admin';
import db from '../../../../shared/config/database';
import { Sequelize, Transaction, Op } from 'sequelize';
import AdminLog, {
   AdminAction,
   AdminLogEntityType,
} from '../../log/models/AdminLog';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as superAdminRepository from '../repository/superAdminRepository';
import * as adminLogRepository from '../../log/repository/adminLogRepository';
import * as adminLogService from '../../log/service/adminLogService';
import * as tripsRepository from '../../../admin/trips/repository/tripsRepository';
import * as reportsRepository from '../../../admin/reports/repository/reportsRepository';
import * as statisticsService from '../../statistics/service/statisticsService';
import Search from '../../../user/models/Search';
import {
   TransactionType,
   TransactionStatus,
} from '../../../payment/models/Transaction';
import User from '../../../user/models/User';
import { TripStatus } from '../../../trips/models/Trip';
import { ReportStatus } from '../../../user/models/Report';
import Wallet from '../../../payment/models/Wallet';
import * as userTransaction from '../../../payment/models/Transaction';
import {
   DateRangeInput,
   getDateRangeBounds,
} from '../../../../shared/utils/dateRange';
import { QueryTypes } from 'sequelize';

interface CreateAdminData {
   email: string;
   firstName: string;
   lastName: string;
}

export const createAdmin = async (
   superAdminId: string,
   adminData: CreateAdminData,
) => {
   const existingAdmin = await superAdminRepository.findAdminByEmail(
      adminData.email,
   );
   if (existingAdmin) {
      throw new ConflictError('An admin with this email already exists.');
   }

   const newAdmin = await superAdminRepository.createAdmin(adminData);

   await adminLogService.logAction(
      superAdminId,
      AdminAction.CREATE_ADMIN,
      undefined,
      newAdmin.id,
      AdminLogEntityType.ADMIN,
      {
         snapshot: {
            label:
               [newAdmin.firstName, newAdmin.lastName]
                  .filter(Boolean)
                  .join(' ') || newAdmin.email,
            subLabel: newAdmin.email,
            meta: { role: newAdmin.role },
         },
      },
   );

   const { password, ...adminResponse } = newAdmin.get({ plain: true });
   return adminResponse;
};

export const deleteAdmin = async (
   superAdminId: string,
   adminIdToDelete: string,
) => {
   const admin = await superAdminRepository.findAdminById(adminIdToDelete);
   if (!admin) throw new NotFoundError('Admin not found.');
   if (adminIdToDelete === superAdminId)
      throw new BadRequestError('Super admins cannot delete themselves.');

   const adminSnapshot = {
      label:
         [admin.firstName, admin.lastName].filter(Boolean).join(' ') ||
         admin.email,
      subLabel: admin.email,
      meta: { role: admin.role },
   };

   const transaction: Transaction = await db.transaction();
   try {
      await AdminLog.destroy({
         where: { adminId: adminIdToDelete },
         transaction,
      });

      const deletedCount = await superAdminRepository.deleteAdminById(
         adminIdToDelete,
         transaction,
      );
      if (deletedCount === 0)
         throw new BadRequestError('Could not delete admin.');

      await transaction.commit();
   } catch (err) {
      await transaction.rollback();
      throw err;
   }

   await adminLogService.logAction(
      superAdminId,
      AdminAction.DELETE_ADMIN,
      undefined,
      adminIdToDelete,
      AdminLogEntityType.ADMIN,
      { snapshot: adminSnapshot },
   );
};
export const getAllAdmins = async () => {
   const admins = await superAdminRepository.findAllAdminsWithStats();
   return admins;
};

export const updateAdminPermissions = async (
   superAdminId: string,
   adminIdToUpdate: string,
   permissions: any,
) => {
   const adminToUpdate =
      await superAdminRepository.findAdminById(adminIdToUpdate);
   if (!adminToUpdate) {
      throw new NotFoundError('Admin not found.');
   }
   if (adminToUpdate.role === AdminRole.SuperAdmin) {
      throw new BadRequestError('Cannot change permissions of a SuperAdmin.');
   }

   adminToUpdate.permissions = permissions;
   await adminToUpdate.save();

   await adminLogService.logAction(
      superAdminId,
      AdminAction.UPDATE_ADMIN_PERMISSIONS,
      undefined,
      adminToUpdate.id,
      AdminLogEntityType.ADMIN,
      {
         snapshot: {
            label:
               [adminToUpdate.firstName, adminToUpdate.lastName]
                  .filter(Boolean)
                  .join(' ') || adminToUpdate.email,
            subLabel: adminToUpdate.email,
            meta: { role: adminToUpdate.role },
         },
         metadata: { permissions },
      },
   );

   const { password, ...adminResponse } = adminToUpdate.get({ plain: true });
   return adminResponse;
};

export const getAdminLogs = async (
   adminId: string,
   options: {
      page: number;
      limit: number;
      sortBy: string;
      sortOrder: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      category?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
   },
) => {
   const admin = await Admin.findByPk(adminId);
   if (!admin) {
      throw new NotFoundError('Admin not found.');
   }

   const { page, limit, ...repoOptions } = options;
   const offset = (page - 1) * limit;

   const { rows, count } = await adminLogRepository.findLogsByAdminId(adminId, {
      ...repoOptions,
      limit,
      offset,
   });

   return {
      logs: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const getGlobalLogs = async (options: {
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   startDate?: string;
   endDate?: string;
   category?: string;
   action?: string;
   entityType?: string;
   entityId?: string;
   adminIds?: string[];
}) => {
   const { page, limit, ...repoOptions } = options;
   const offset = (page - 1) * limit;

   const { rows, count } = await adminLogRepository.findAllLogs({
      ...repoOptions,
      limit,
      offset,
   });

   return {
      logs: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const getAdminDetails = async (
   adminId: string,
   range?: { from?: Date; to?: Date },
) => {
   const admin = await Admin.findByPk(adminId, {
      attributes: { exclude: ['password'] },
   });
   if (!admin) throw new NotFoundError('Admin not found.');

   const [actionStats, sessionLogs, recentActions] = await Promise.all([
      adminLogRepository.getAdminActionStats(adminId, range?.from, range?.to),
      adminLogRepository.getSessionTimeline(adminId, 200),
      adminLogRepository.findLogsByAdminId(adminId, {
         limit: 25,
         offset: 0,
         sortBy: 'timestamp',
         sortOrder: 'DESC',
      }),
   ]);

   // Парим LOGIN/LOGOUT в сессии: по sessionId если есть, иначе по последовательности.
   type SessionRow = {
      sessionId?: string;
      loginAt?: Date;
      logoutAt?: Date;
      ipAddress?: string | null;
      userAgent?: string | null;
      durationMinutes?: number;
   };
   const sessionsMap = new Map<string, SessionRow>();
   const orphanLogins: SessionRow[] = [];
   const orphanLogouts: SessionRow[] = [];

   // Отсортируем хронологически (старые → новые) для парного матчинга
   const ordered = [...sessionLogs].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
   );
   for (const log of ordered) {
      const sid = log.sessionId || undefined;
      if (sid) {
         const existing =
            sessionsMap.get(sid) || ({ sessionId: sid } as SessionRow);
         if (log.action === AdminAction.LOGIN) {
            existing.loginAt = log.timestamp;
            existing.ipAddress = log.ipAddress ?? existing.ipAddress;
            existing.userAgent = log.userAgent ?? existing.userAgent;
         } else if (log.action === AdminAction.LOGOUT) {
            existing.logoutAt = log.timestamp;
         }
         if (existing.loginAt && existing.logoutAt) {
            existing.durationMinutes = Math.round(
               (existing.logoutAt.getTime() - existing.loginAt.getTime()) /
                  60_000,
            );
         }
         sessionsMap.set(sid, existing);
      } else {
         // Старые логи без sessionId — складываем в orphan-секции.
         if (log.action === AdminAction.LOGIN) {
            orphanLogins.push({
               loginAt: log.timestamp,
               ipAddress: log.ipAddress,
               userAgent: log.userAgent,
            });
         } else {
            orphanLogouts.push({
               logoutAt: log.timestamp,
            });
         }
      }
   }

   const sessions = Array.from(sessionsMap.values()).sort((a, b) => {
      const at = (a.loginAt ?? a.logoutAt)?.getTime() ?? 0;
      const bt = (b.loginAt ?? b.logoutAt)?.getTime() ?? 0;
      return bt - at;
   });

   const { password, ...adminProfile } = admin.get({ plain: true });

   return {
      admin: adminProfile,
      stats: actionStats,
      sessions: {
         tracked: sessions,
         legacyLogins: orphanLogins,
         legacyLogouts: orphanLogouts,
      },
      recentActions: recentActions.rows,
   };
};

// Возвращает страницу IN_PROGRESS поездок + лёгкий снапшот суммарных метрик
// (bookings/seats/выручка). Снапшот покрывает IN_PROGRESS+CREATED, чтобы тот же
// эндпоинт мог показывать KPI-блоки в шапке списка.
export const getActiveTrips = async (options: any) => {
   const [page, snapshot] = await Promise.all([
      tripsRepository.findAllTrips({
         ...options,
         status: TripStatus.InProgress,
      }),
      statisticsService.getActiveTripsSnapshot(),
   ]);
   return { ...page, snapshot };
};

export const getFinishedTrips = async (options: any) => {
   return tripsRepository.findAllTrips({
      ...options,
      status: TripStatus.Completed,
   });
};

export const getWalletTopUps = async (
   options: DateRangeInput & {
      page: number;
      limit: number;
      sortBy: string;
      sortOrder: string;
      search?: string;
   },
) => {
   const { page, limit, sortBy, sortOrder, search } = options;
   const offset = (page - 1) * limit;
   const whereClause: any = {
      status: TransactionStatus.COMPLETED,
   };

   if (search) {
      whereClause[Op.or] = [{ id: { [Op.iLike]: `%${search}%` } }];
   }

   const bounds = getDateRangeBounds(options);
   if (bounds) {
      whereClause.createdAt = { [Op.between]: [bounds.start, bounds.end] };
   }

   const { count, rows } = await userTransaction.default.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
         {
            model: Wallet,
            as: 'wallet',
            include: [
               {
                  model: User,
                  as: 'user',
                  attributes: ['id', 'firstName', 'lastName', 'phoneNumber'],
               },
            ],
         },
      ],
   });

   return {
      rows,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const getGuests = async (options: { page: number; limit: number }) => {
   const { page, limit } = options;
   const offset = (page - 1) * limit;

   const { count, rows } = await Search.findAndCountAll({
      attributes: [
         'guestId',
         [Sequelize.fn('MAX', Sequelize.col('created_at')), 'lastActive'],
      ],
      where: {
         userId: null,
         guestId: { [Op.ne]: null },
      },
      group: ['guestId'],
      limit,
      offset,
      order: [[Sequelize.literal('"lastActive"'), 'DESC']],
   });

   // Hack for count with GroupBy in Sequelize
   const totalCount = (count as any).length || count;

   return {
      rows,
      count: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
   };
};

// Reports: wrapper around existing repo logic but for Super Admin
export const getReports = async (options: any) => {
   const { page, limit, ...repoOptions } = options;
   const offset = (page - 1) * limit;
   const statuses = [
      ReportStatus.PENDING,
      ReportStatus.RESOLVED,
      ReportStatus.REJECTED,
   ];

   const { count, rows } = await reportsRepository.getAllReports(
      statuses,
      limit,
      offset,
      repoOptions,
   );
   return {
      rows,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

// Searches list page (агрегация по маршрутам, не сырые записи)
export const getSearchesPage = async (
   options: DateRangeInput & {
      page: number;
      limit: number;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
   },
) => {
   const { page, limit, search, sortBy, sortOrder } = options;
   const offset = (page - 1) * limit;
   const order =
      String(sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
   const sortColumn =
      sortBy === 'last_searched_at' ? 'last_searched_at' : 'count';

   const bounds = getDateRangeBounds(options);
   const replacements: any = { limit, offset };
   const conds: string[] = [
      `COALESCE(s.from_city, '') <> ''`,
      `COALESCE(s.to_city, '') <> ''`,
   ];

   if (bounds) {
      conds.push(`s.created_at BETWEEN :start AND :end`);
      replacements.start = bounds.start;
      replacements.end = bounds.end;
   }
   if (search && search.trim().length > 0) {
      conds.push(
         `(s.from_city ILIKE :search OR s.to_city ILIKE :search OR s.from_address ILIKE :search OR s.to_address ILIKE :search)`,
      );
      replacements.search = `%${search.trim()}%`;
   }
   const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

   const [rows, totalRows] = await Promise.all([
      db.query(
         `SELECT s.from_city,
                 s.to_city,
                 COUNT(*)::int AS count,
                 COUNT(DISTINCT s."userId")::int AS unique_users,
                 COUNT(DISTINCT s.guest_id)::int AS unique_guests,
                 MAX(s.created_at) AS last_searched_at
            FROM searches s
            ${where}
        GROUP BY s.from_city, s.to_city
        ORDER BY ${sortColumn} ${order}
           LIMIT :limit OFFSET :offset;`,
         { type: QueryTypes.SELECT, replacements },
      ),
      db
         .query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM (
             SELECT 1 FROM searches s ${where}
              GROUP BY s.from_city, s.to_city
         ) t;`,
            { type: QueryTypes.SELECT, replacements },
         )
         .then((r) => parseInt(r[0]?.count ?? '0', 10)),
   ]);

   // Подмешиваем для каждой пары наличие активных трипов (есть ли предложение)
   const ids = (rows as any[])
      .map(
         (r) =>
            `('${(r.from_city as string).replace(
               /'/g,
               "''",
            )}','${(r.to_city as string).replace(/'/g, "''")}')`,
      )
      .join(',');

   let supply: any[] = [];
   if (ids.length > 0) {
      supply = await db.query(
         `SELECT t.from_city, t.to_city,
                 COUNT(*) FILTER (WHERE t.status IN ('CREATED','IN_PROGRESS'))::int AS active_trips
            FROM trips t
           WHERE (LOWER(t.from_city), LOWER(t.to_city)) IN (${(rows as any[])
              .map(
                 (r) =>
                    `(LOWER('${String(r.from_city).replace(/'/g, "''")}'), LOWER('${String(
                       r.to_city,
                    ).replace(/'/g, "''")}'))`,
              )
              .join(',')})
        GROUP BY t.from_city, t.to_city;`,
         { type: QueryTypes.SELECT },
      );
   }
   const supplyKey = (a: string, b: string) =>
      `${(a || '').toLowerCase()}::${(b || '').toLowerCase()}`;
   const supplyMap = new Map(
      (supply as any[]).map((s) => [
         supplyKey(s.from_city, s.to_city),
         s.active_trips,
      ]),
   );

   const enriched = (rows as any[]).map((r) => ({
      from_city: r.from_city,
      to_city: r.to_city,
      count: r.count,
      unique_users: r.unique_users,
      unique_guests: r.unique_guests,
      last_searched_at: r.last_searched_at,
      active_trips: supplyMap.get(supplyKey(r.from_city, r.to_city)) || 0,
   }));

   return {
      rows: enriched,
      total: totalRows,
      totalPages: Math.ceil(totalRows / limit),
      currentPage: page,
   };
};

export const me = async (adminId: string) => {
   return await Admin.findByPk(adminId);
};
