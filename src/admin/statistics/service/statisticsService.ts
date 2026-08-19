import User, { UserRole, RegistrationSource } from '../../../user/models/User';
import Report, { ReportStatus } from '../../../user/models/Report';
import Booking, { BookingStatus } from '../../../booking/models/Booking';
import Trip, { TripStatus } from '../../../trips/models/Trip';
import Car from '../../../car/model/Car';
import DriverApplication, {
   DriverApplicationStatus,
} from '../../../car/model/DriverApplication';
import Search from '../../../user/models/Search';
import Transaction, {
   TransactionType,
   TransactionStatus,
} from '../../../payment/models/Transaction';
import Wallet from '../../../payment/models/Wallet';
import Admin, { AdminRole } from '../../auth/models/Admin';
import AdminLog from '../../log/models/AdminLog';
import { Sequelize, Op, QueryTypes } from 'sequelize';
import { getOrSetCache } from '../../../../shared/config/redis';
import db from '../../../../shared/config/database';
import {
   resolveDateRange,
   ResolvedDateRange,
} from '../../../../shared/utils/dateRange';

export type StatsRange =
   | 'today'
   | 'yesterday'
   | 'day' // legacy alias for today
   | 'week'
   | 'month'
   | 'quarter'
   | 'year'
   | 'custom';

export interface RangeOptions {
   range?: StatsRange | string;
   from?: string | Date;
   to?: string | Date;
}

type ResolvedRange = ResolvedDateRange;

const resolveRange = (opts: RangeOptions = {}): ResolvedRange =>
   resolveDateRange({
      range: opts.range as string | undefined,
      from: opts.from,
      to: opts.to,
   });

const buildTimeSeries = async (
   model: any,
   dateField: string,
   range: ResolvedRange,
   whereClause: any = {},
   options: { aggregate?: 'count' | 'sum'; sumColumn?: string } = {},
) => {
   const aggregate = options.aggregate ?? 'count';
   const fn =
      aggregate === 'sum' && options.sumColumn
         ? Sequelize.fn('SUM', Sequelize.col(options.sumColumn))
         : Sequelize.fn('COUNT', Sequelize.literal('*'));

   return model.findAll({
      attributes: [
         [
            Sequelize.fn(
               'date_trunc',
               range.bucketUnit,
               Sequelize.col(dateField),
            ),
            'period',
         ],
         [fn, 'value'],
      ],
      where: {
         ...whereClause,
         [dateField]: { [Op.between]: [range.start, range.end] },
      },
      group: ['period'],
      order: [[Sequelize.literal('period'), 'ASC']],
      raw: true,
   });
};

const formatSeries = (rows: any[], range: ResolvedRange) => {
   return rows.map((row) => {
      const date = new Date(row.period);
      let label;
      if (range.bucketUnit === 'hour') {
         label = date.toISOString().slice(11, 16);
      } else if (range.bucketUnit === 'month') {
         label = date.toLocaleString('default', {
            month: 'short',
            year: 'numeric',
         });
      } else {
         label = date.toLocaleString('default', {
            day: 'numeric',
            month: 'short',
         });
      }
      return {
         date: label,
         timestamp: date.toISOString(),
         value: parseFloat(row.value ?? '0'),
      };
   });
};

const sumSeries = (rows: { value: number }[]) =>
   rows.reduce((acc, r) => acc + (r.value || 0), 0);

const wrapRange = (range: ResolvedRange) => ({
   range: range.key,
   from: range.start.toISOString(),
   to: range.end.toISOString(),
});

const aggregateUsersSource = (
   rows: Array<{
      registration_source: string;
      role: string;
      count: string | number;
   }>,
) => {
   const out = {
      byRole: { drivers: 0, passengers: 0 },
      bySource: { self: 0, botImported: 0, regBot: 0 },
      byRoleAndSource: {
         drivers: { self: 0, botImported: 0, regBot: 0 },
         passengers: { self: 0, botImported: 0, regBot: 0 },
      },
   };
   for (const r of rows || []) {
      const c =
         typeof r.count === 'number'
            ? r.count
            : parseInt(String(r.count), 10) || 0;
      const isDriver = r.role === 'Driver';
      const sourceKey =
         r.registration_source === 'from_bot'
            ? 'botImported'
            : r.registration_source === 'reg_bot'
              ? 'regBot'
              : 'self';
      if (isDriver) out.byRole.drivers += c;
      else out.byRole.passengers += c;
      out.bySource[sourceKey] += c;
      if (isDriver) out.byRoleAndSource.drivers[sourceKey] += c;
      else out.byRoleAndSource.passengers[sourceKey] += c;
   }
   return out;
};

// HELPERS: real-vs-bots segmentation
//
// Семантика, согласованная с продуктом:
//   • real     — registration_source = 'user'        (зарегистрировались сами в приложении)
//   • bots     — registration_source IN ('from_bot','reg_bot')  (импорт/реферальный бот)
//   • all      — все вместе (real + bots)
//   • guests   — searches.guest_id IS NOT NULL и userId IS NULL (анонимные поиски)
//
// Все «реальные» (production-ready) метрики строятся ТОЛЬКО по real.
// Bots / guests доступны отдельными разрезами, чтобы было понятно что есть мусор.

export const BOT_SOURCES = [
   RegistrationSource.FromBot,
   RegistrationSource.RegBot,
] as const;

const REAL_WHERE = { registration_source: RegistrationSource.User } as const;
const BOTS_WHERE = {
   registration_source: { [Op.in]: BOT_SOURCES as unknown as string[] },
} as const;

const countUsersSegmented = async (
   where: any = {},
): Promise<{ real: number; bots: number; all: number }> => {
   const [real, bots, all] = await Promise.all([
      User.count({ where: { ...where, ...REAL_WHERE } }),
      User.count({ where: { ...where, ...BOTS_WHERE } }),
      User.count({ where }),
   ]);
   return { real, bots, all };
};

const buildTotals = async <T>(
   allTimeFn: () => Promise<T>,
   rangeFn: () => Promise<T>,
): Promise<{ total: T; totalInRange: T }> => {
   const [total, totalInRange] = await Promise.all([allTimeFn(), rangeFn()]);
   return { total, totalInRange };
};

// HELPERS: DAU / MAU / source segmentation
//
// DAU/MAU считаются как distinct user_id, у которых есть активность за окно.
// Активностью считаем: search (userId), booking (passengerId), trip (driver_id).
// Если в будущем появится sessions/last_seen — миграция на него тривиальна.

const dauMauUserUnionSQL = `
   SELECT u.id, u.role, u.registration_source
     FROM users u
    WHERE u.registration_source IN ('user', 'reg_bot')
      AND u.id IN (
        SELECT s."userId" FROM searches s
         WHERE s."userId" IS NOT NULL AND s.created_at >= :start AND s.created_at <= :end
        UNION
        SELECT b."passengerId" FROM bookings b
         WHERE b."createdAt" >= :start AND b."createdAt" <= :end
        UNION
        -- created_at заполняется ботом автоматически — не показатель активности.
        -- trip_start_ts проставляется только когда водитель сам нажал "начать поездку".
        SELECT t.driver_id FROM trips t
         WHERE t.trip_start_ts IS NOT NULL
           AND t.trip_start_ts >= :start AND t.trip_start_ts <= :end
    )
`;

// Активные пользователи за окно, БЕЗ фильтра по registration_source — нужно,
// чтобы посчитать сегментированный DAU/MAU (real / bots / all).
const dauMauActiveUsersSQL = `
   SELECT u.id, u.role, u.registration_source
     FROM users u
    WHERE u.id IN (
        SELECT s."userId" FROM searches s
         WHERE s."userId" IS NOT NULL AND s.created_at >= :start AND s.created_at <= :end
        UNION
        SELECT b."passengerId" FROM bookings b
         WHERE b."createdAt" >= :start AND b."createdAt" <= :end
        UNION
        SELECT t.driver_id FROM trips t
         WHERE t.trip_start_ts IS NOT NULL
           AND t.trip_start_ts >= :start AND t.trip_start_ts <= :end
    )
`;

const dauMauGuestsSQL = `
   SELECT COUNT(DISTINCT guest_id)::text AS count
     FROM searches
    WHERE guest_id IS NOT NULL
      AND "userId" IS NULL
      AND created_at >= :start AND created_at <= :end
`;

interface SegmentedUserRow {
   id: string;
   role: 'Driver' | 'Passenger';
   registration_source: 'user' | 'from_bot' | 'reg_bot';
}

const segmentRows = (rows: SegmentedUserRow[]) => {
   let total = 0;
   let drivers = 0;
   let passengers = 0;
   let selfRegistered = 0;
   let botImported = 0;
   let regBot = 0;
   for (const r of rows) {
      total++;
      if (r.role === 'Driver') drivers++;
      else if (r.role === 'Passenger') passengers++;
      if (r.registration_source === 'from_bot') botImported++;
      else if (r.registration_source === 'reg_bot') regBot++;
      else selfRegistered++;
   }
   return {
      total,
      byRole: { drivers, passengers },
      bySource: {
         self: selfRegistered,
         botImported,
         regBot,
      },
   };
};

const segmentActiveRows = (rows: SegmentedUserRow[]) => {
   const buckets = {
      real: { count: 0, drivers: 0, passengers: 0 },
      bots: { count: 0, drivers: 0, passengers: 0 },
      all: { count: 0, drivers: 0, passengers: 0 },
   };
   for (const r of rows) {
      const bucket =
         r.registration_source === 'user' ? buckets.real : buckets.bots;
      bucket.count++;
      buckets.all.count++;
      if (r.role === 'Driver') {
         bucket.drivers++;
         buckets.all.drivers++;
      } else if (r.role === 'Passenger') {
         bucket.passengers++;
         buckets.all.passengers++;
      }
   }
   return buckets;
};

const safeRatio = (a: number, b: number, digits = 3): number =>
   b > 0 ? Number((a / b).toFixed(digits)) : 0;

/**
 * Считает DAU (последние 24 часа) и MAU (последние 30 дней) на момент now,
 * с сегментацией по роли и источнику регистрации.
 *
 * Возвращает:
 *   • dau / mau   — старый формат (real+reg_bot), не ломаем фронт;
 *   • bySegment   — новый формат: { real, bots, all, guests } для DAU и MAU
 *                   плюс stickiness внутри каждого сегмента.
 *   • totals.bySegment — total users / drivers / passengers по сегментам (all-time).
 */
export const getDauMauSegmentation = async () => {
   const now = new Date();
   const dauStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
   const mauStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

   return getOrSetCache(
      'admin_stats_dau_mau_v2',
      async () => {
         const [
            dauRowsLegacy,
            mauRowsLegacy,
            sourceTotalsLegacy,
            dauRowsAll,
            mauRowsAll,
            dauGuests,
            mauGuests,
            totalsAll,
         ] = await Promise.all([
            db.query<SegmentedUserRow>(dauMauUserUnionSQL, {
               type: QueryTypes.SELECT,
               replacements: { start: dauStart, end: now },
            }),
            db.query<SegmentedUserRow>(dauMauUserUnionSQL, {
               type: QueryTypes.SELECT,
               replacements: { start: mauStart, end: now },
            }),
            db.query<{
               registration_source: string;
               role: string;
               count: string;
            }>(
               `SELECT registration_source, role, COUNT(*)::text AS count
               FROM users
               WHERE registration_source IN ('user', 'reg_bot')
               GROUP BY registration_source, role;`,
               { type: QueryTypes.SELECT },
            ),
            db.query<SegmentedUserRow>(dauMauActiveUsersSQL, {
               type: QueryTypes.SELECT,
               replacements: { start: dauStart, end: now },
            }),
            db.query<SegmentedUserRow>(dauMauActiveUsersSQL, {
               type: QueryTypes.SELECT,
               replacements: { start: mauStart, end: now },
            }),
            db
               .query<{ count: string }>(dauMauGuestsSQL, {
                  type: QueryTypes.SELECT,
                  replacements: { start: dauStart, end: now },
               })
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            db
               .query<{ count: string }>(dauMauGuestsSQL, {
                  type: QueryTypes.SELECT,
                  replacements: { start: mauStart, end: now },
               })
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            db.query<{
               registration_source: string;
               role: string;
               count: string;
            }>(
               `SELECT registration_source, role, COUNT(*)::text AS count
                  FROM users
              GROUP BY registration_source, role;`,
               { type: QueryTypes.SELECT },
            ),
         ]);

         // Legacy totals (real + reg_bot) — для обратной совместимости
         const totals = {
            byRole: { drivers: 0, passengers: 0 },
            bySource: { self: 0, botImported: 0, regBot: 0 },
         };
         for (const row of sourceTotalsLegacy) {
            const c = parseInt(row.count, 10) || 0;
            if (row.role === 'Driver') totals.byRole.drivers += c;
            else if (row.role === 'Passenger') totals.byRole.passengers += c;
            if (row.registration_source === 'from_bot')
               totals.bySource.botImported += c;
            else if (row.registration_source === 'reg_bot')
               totals.bySource.regBot += c;
            else totals.bySource.self += c;
         }

         const totalsBySegment = {
            real: { all: 0, drivers: 0, passengers: 0 },
            bots: { all: 0, drivers: 0, passengers: 0 },
            all: { all: 0, drivers: 0, passengers: 0 },
         };
         for (const row of totalsAll) {
            const c = parseInt(row.count, 10) || 0;
            const bucket =
               row.registration_source === 'user'
                  ? totalsBySegment.real
                  : totalsBySegment.bots;
            bucket.all += c;
            totalsBySegment.all.all += c;
            if (row.role === 'Driver') {
               bucket.drivers += c;
               totalsBySegment.all.drivers += c;
            } else if (row.role === 'Passenger') {
               bucket.passengers += c;
               totalsBySegment.all.passengers += c;
            }
         }

         const dauSeg = segmentActiveRows(dauRowsAll as SegmentedUserRow[]);
         const mauSeg = segmentActiveRows(mauRowsAll as SegmentedUserRow[]);

         const bySegment = {
            real: {
               dau: dauSeg.real,
               mau: mauSeg.real,
               stickiness: safeRatio(dauSeg.real.count, mauSeg.real.count),
            },
            bots: {
               dau: dauSeg.bots,
               mau: mauSeg.bots,
               stickiness: safeRatio(dauSeg.bots.count, mauSeg.bots.count),
            },
            all: {
               dau: dauSeg.all,
               mau: mauSeg.all,
               stickiness: safeRatio(dauSeg.all.count, mauSeg.all.count),
            },
            guests: {
               dau: { count: dauGuests },
               mau: { count: mauGuests },
               stickiness: safeRatio(dauGuests, mauGuests),
            },
         };

         return {
            now: now.toISOString(),
            // --- legacy (real+reg_bot) — оставлен ради обратной совместимости ---
            dau: {
               windowStart: dauStart.toISOString(),
               ...segmentRows(dauRowsLegacy as SegmentedUserRow[]),
            },
            mau: {
               windowStart: mauStart.toISOString(),
               ...segmentRows(mauRowsLegacy as SegmentedUserRow[]),
            },
            stickiness:
               (mauRowsLegacy as SegmentedUserRow[]).length > 0
                  ? Number(
                       (
                          (dauRowsLegacy as SegmentedUserRow[]).length /
                          (mauRowsLegacy as SegmentedUserRow[]).length
                       ).toFixed(3),
                    )
                  : 0,
            totals,
            // --- production-ready сегментация (new shape) -----------------
            windows: {
               dauStart: dauStart.toISOString(),
               mauStart: mauStart.toISOString(),
            },
            bySegment,
            totalsBySegment,
         };
      },
      300,
   );
};

// 1. OVERVIEW — большой dashboard, ВСЁ в одном запросе для главного экрана
export const getOverviewStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_overview_v2_${range.key}`;

   // legacy baseWhere — для старых полей (real-only registrations в диапазоне)
   const baseWhere = {
      createdAt: { [Op.between]: [range.start, range.end] },
      registration_source: RegistrationSource.User,
   };
   const rangeWhere = { createdAt: { [Op.between]: [range.start, range.end] } };

   return getOrSetCache(
      cacheKey,
      async () => {
         // ───────────────────────── USERS: сегментированные all-time и in-range
         const [
            usersTotalSeg,
            usersInRangeSeg,
            driversTotalSeg,
            driversInRangeSeg,
            passengersTotalSeg,
            passengersInRangeSeg,
            // legacy real-only (registration_source='user')
            totalUsersRealAll,
            totalPassengersRealAll,
            totalDriversRealAll,
            newUsersRealInRange,
            newDriversRealInRange,
            // flags — total + range, real-only (чтобы не пересекаться с ботами)
            verifiedRealTotal,
            verifiedRealInRange,
            bannedRealTotal,
            bannedRealInRange,
            // графики (real-only — production-ready чистая линия)
            usersGraph,
            driversGraph,
            usersGraphAll,
            usersBySourceAllTime,
            newUsersBySource,
            dauMauData,
         ] = await Promise.all([
            countUsersSegmented(),
            countUsersSegmented(rangeWhere),
            countUsersSegmented({ role: UserRole.Driver }),
            countUsersSegmented({ ...rangeWhere, role: UserRole.Driver }),
            countUsersSegmented({ role: UserRole.Passenger }),
            countUsersSegmented({
               ...rangeWhere,
               role: UserRole.Passenger,
            }),

            User.count({ where: REAL_WHERE }),
            User.count({
               where: { ...REAL_WHERE, role: UserRole.Passenger },
            }),
            User.count({ where: { ...REAL_WHERE, role: UserRole.Driver } }),
            User.count({ where: baseWhere }),
            User.count({ where: { ...baseWhere, role: UserRole.Driver } }),

            User.count({ where: { ...REAL_WHERE, verified: true } }),
            User.count({
               where: { ...baseWhere, verified: true },
            }),
            User.count({ where: { ...REAL_WHERE, isBanned: true } }),
            User.count({
               where: { ...baseWhere, isBanned: true },
            }),

            // graph только по real — чтобы тренды регистраций были без шума
            buildTimeSeries(User, 'createdAt', range, REAL_WHERE),
            buildTimeSeries(User, 'createdAt', range, {
               ...REAL_WHERE,
               role: UserRole.Driver,
            }),
            buildTimeSeries(User, 'createdAt', range), // all-segments график (для compare)

            User.findAll({
               attributes: [
                  'registration_source',
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['registration_source', 'role'],
               raw: true,
            }) as any,

            User.findAll({
               attributes: [
                  'registration_source',
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               where: rangeWhere,
               group: ['registration_source', 'role'],
               raw: true,
            }) as any,

            getDauMauSegmentation(),
         ]);

         const activeTripsSnapshot = await getActiveTripsSnapshot();

         // ───────────────────────── TRIPS / BOOKINGS / ETC
         const tripCreatedRangeWhere = {
            created_at: { [Op.between]: [range.start, range.end] },
         };
         const tripUpdatedRangeWhere = {
            updated_at: { [Op.between]: [range.start, range.end] },
         };
         const [
            // TRIPS
            totalTrips,
            createdTrips,
            inProgressTrips,
            completedTrips,
            canceledTrips,
            totalTripsInRange,
            createdTripsInRange,
            inProgressTripsInRange,
            completedTripsInRange,
            canceledTripsInRange,
            tripsCreatedInRange,
            tripsCompletedInRange,
            tripsGraph,

            // BOOKINGS
            totalBookings,
            confirmedBookings,
            pendingBookings,
            cancelledBookings,
            totalBookingsInRange,
            confirmedBookingsInRange,
            pendingBookingsInRange,
            cancelledBookingsInRange,
            bookingsGraph,

            // REPORTS
            totalReports,
            pendingReports,
            resolvedReports,
            rejectedReports,
            reportsInRange,
            pendingReportsInRange,
            resolvedReportsInRange,
            rejectedReportsInRange,
            reportsGraph,

            // WALLET
            walletTotalBalance,
            walletTopUpsAllTime,
            walletTopUpsInRange,
            walletPaymentsAllTime,
            walletPaymentsInRange,
            walletRefundsAllTime,
            walletRefundsInRange,
            transactionsGraph,

            // DRIVER APPS
            pendingDriverApps,
            verifiedDriverApps,
            pendingDriverAppsInRange,
            verifiedDriverAppsInRange,

            // ADMINS
            totalAdmins,
            totalSuperAdmins,

            // GUESTS
            uniqueGuestsAllTime,
            uniqueGuestsInRange,
         ] = await Promise.all([
            // ─ TRIPS
            Trip.count(),
            Trip.count({ where: { status: TripStatus.Created } }),
            Trip.count({ where: { status: TripStatus.InProgress } }),
            Trip.count({ where: { status: TripStatus.Completed } }),
            Trip.count({ where: { status: TripStatus.Canceled } }),
            Trip.count({ where: tripCreatedRangeWhere }),
            Trip.count({
               where: {
                  status: TripStatus.Created,
                  ...tripCreatedRangeWhere,
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.InProgress,
                  ...tripCreatedRangeWhere,
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.Completed,
                  ...tripUpdatedRangeWhere,
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.Canceled,
                  ...tripUpdatedRangeWhere,
               },
            }),
            Trip.count({ where: tripCreatedRangeWhere }),
            Trip.count({
               where: {
                  status: TripStatus.Completed,
                  ...tripUpdatedRangeWhere,
               },
            }),
            buildTimeSeries(Trip, 'created_at', range),

            // ─ BOOKINGS
            Booking.count(),
            Booking.count({ where: { status: BookingStatus.CONFIRMED } }),
            Booking.count({ where: { status: BookingStatus.PENDING } }),
            Booking.count({ where: { status: BookingStatus.CANCELLED } }),
            Booking.count({
               where: { createdAt: { [Op.between]: [range.start, range.end] } },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.CONFIRMED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.PENDING,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.CANCELLED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            buildTimeSeries(Booking, 'createdAt', range),

            // ─ REPORTS
            Report.count(),
            Report.count({ where: { status: ReportStatus.PENDING } }),
            Report.count({ where: { status: ReportStatus.RESOLVED } }),
            Report.count({ where: { status: ReportStatus.REJECTED } }),
            Report.count({
               where: { createdAt: { [Op.between]: [range.start, range.end] } },
            }),
            Report.count({
               where: {
                  status: ReportStatus.PENDING,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Report.count({
               where: {
                  status: ReportStatus.RESOLVED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Report.count({
               where: {
                  status: ReportStatus.REJECTED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            buildTimeSeries(Report, 'createdAt', range),

            // ─ WALLET
            Wallet.sum('balance').then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.REFUND,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.REFUND,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            buildTimeSeries(
               Transaction,
               'createdAt',
               range,
               {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
               },
               { aggregate: 'sum', sumColumn: 'amount' },
            ),

            // ─ DRIVER APPS
            DriverApplication.count({
               where: { status: DriverApplicationStatus.PENDING },
            }),
            DriverApplication.count({
               where: { status: DriverApplicationStatus.VERIFIED },
            }),
            DriverApplication.count({
               where: {
                  status: DriverApplicationStatus.PENDING,
                  createdAt: { [Op.between]: [range.start, range.end] },
               } as any,
            }),
            DriverApplication.count({
               where: {
                  status: DriverApplicationStatus.VERIFIED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               } as any,
            }),

            // ─ ADMINS
            Admin.count({ where: { role: AdminRole.Admin } }),
            Admin.count({ where: { role: AdminRole.SuperAdmin } }),

            // ─ GUESTS — уникальные guestId по поискам
            Search.count({
               where: { userId: null, guestId: { [Op.ne]: null } },
               distinct: true,
               col: 'guestId',
            }),
            Search.count({
               where: {
                  userId: null,
                  guestId: { [Op.ne]: null },
                  created_at: { [Op.between]: [range.start, range.end] },
               },
               distinct: true,
               col: 'guestId',
            }),
         ]);

         return {
            ...wrapRange(range),
            users: {
               // ─── legacy поля (real-only) — фронт пока на них смотрит ────
               total: totalUsersRealAll,
               // legacy "users-in-range + guests" — оставлено как было
               totalInRange: newUsersRealInRange + uniqueGuestsInRange,
               passengers: totalPassengersRealAll,
               passengerInRange: passengersInRangeSeg.real,
               drivers: totalDriversRealAll,
               driversInRange: driversInRangeSeg.real,
               verified: verifiedRealTotal,
               banned: bannedRealTotal,
               newInRange: newUsersRealInRange,
               newDriversInRange: newDriversRealInRange,
               graph: formatSeries(usersGraph as any[], range),
               driversGraph: formatSeries(driversGraph as any[], range),
               bySource: aggregateUsersSource(usersBySourceAllTime),
               newBySource: aggregateUsersSource(newUsersBySource),
               dauMau: dauMauData,

               // ─── new production-ready shape: { total, totalInRange } × { real,bots,all } ─
               counts: {
                  total: usersTotalSeg,
                  totalInRange: usersInRangeSeg,
               },
               passengersCounts: {
                  total: passengersTotalSeg,
                  totalInRange: passengersInRangeSeg,
               },
               driversCounts: {
                  total: driversTotalSeg,
                  totalInRange: driversInRangeSeg,
               },
               flags: {
                  verified: {
                     total: verifiedRealTotal,
                     totalInRange: verifiedRealInRange,
                  },
                  banned: {
                     total: bannedRealTotal,
                     totalInRange: bannedRealInRange,
                  },
               },
               graphAll: formatSeries(usersGraphAll as any[], range),
            },

            trips: {
               // legacy
               total: totalTrips,
               totalInRange: totalTripsInRange,
               byStatus: {
                  CREATED: createdTrips,
                  IN_PROGRESS: inProgressTrips,
                  COMPLETED: completedTrips,
                  CANCELED: canceledTrips,
               },
               createdInRange: tripsCreatedInRange,
               completedInRange: tripsCompletedInRange,
               graph: formatSeries(tripsGraph as any[], range),
               active: activeTripsSnapshot,

               // new
               counts: {
                  total: totalTrips,
                  totalInRange: totalTripsInRange,
               },
               byStatusInRange: {
                  CREATED: createdTripsInRange,
                  IN_PROGRESS: inProgressTripsInRange,
                  COMPLETED: completedTripsInRange,
                  CANCELED: canceledTripsInRange,
               },
               rates: {
                  completionRateAllTime: safeRatio(completedTrips, totalTrips),
                  completionRateInRange: safeRatio(
                     completedTripsInRange,
                     totalTripsInRange,
                  ),
                  cancellationRateAllTime: safeRatio(canceledTrips, totalTrips),
                  cancellationRateInRange: safeRatio(
                     canceledTripsInRange,
                     totalTripsInRange,
                  ),
               },
            },

            bookings: {
               // legacy
               total: totalBookings,
               totalInRange: totalBookingsInRange,
               byStatus: {
                  CONFIRMED: confirmedBookings,
                  PENDING: pendingBookings,
                  CANCELLED: cancelledBookings,
               },
               graph: formatSeries(bookingsGraph as any[], range),

               // new
               counts: {
                  total: totalBookings,
                  totalInRange: totalBookingsInRange,
               },
               byStatusInRange: {
                  CONFIRMED: confirmedBookingsInRange,
                  PENDING: pendingBookingsInRange,
                  CANCELLED: cancelledBookingsInRange,
               },
               rates: {
                  confirmationRateAllTime: safeRatio(
                     confirmedBookings,
                     totalBookings,
                  ),
                  confirmationRateInRange: safeRatio(
                     confirmedBookingsInRange,
                     totalBookingsInRange,
                  ),
                  cancellationRateAllTime: safeRatio(
                     cancelledBookings,
                     totalBookings,
                  ),
                  cancellationRateInRange: safeRatio(
                     cancelledBookingsInRange,
                     totalBookingsInRange,
                  ),
               },
            },

            reports: {
               // legacy
               total: totalReports,
               newInRange: reportsInRange,
               byStatus: {
                  PENDING: pendingReports,
                  RESOLVED: resolvedReports,
                  REJECTED: rejectedReports,
               },
               graph: formatSeries(reportsGraph as any[], range),

               // new
               counts: {
                  total: totalReports,
                  totalInRange: reportsInRange,
               },
               byStatusInRange: {
                  PENDING: pendingReportsInRange,
                  RESOLVED: resolvedReportsInRange,
                  REJECTED: rejectedReportsInRange,
               },
            },

            wallet: {
               // legacy
               totalBalance: Number(walletTotalBalance),
               topUpsInRange: Number(walletTopUpsInRange),
               graph: formatSeries(transactionsGraph as any[], range),

               // new
               balance: {
                  // snapshot (нет range — это «сейчас»)
                  total: Number(walletTotalBalance),
               },
               topUps: {
                  total: Number(walletTopUpsAllTime),
                  totalInRange: Number(walletTopUpsInRange),
               },
               payments: {
                  total: Number(walletPaymentsAllTime),
                  totalInRange: Number(walletPaymentsInRange),
               },
               refunds: {
                  total: Number(walletRefundsAllTime),
                  totalInRange: Number(walletRefundsInRange),
               },
            },

            applications: {
               // legacy
               pending: pendingDriverApps,
               verified: verifiedDriverApps,

               // new — total + totalInRange
               pendingCounts: {
                  total: pendingDriverApps,
                  totalInRange: pendingDriverAppsInRange,
               },
               verifiedCounts: {
                  total: verifiedDriverApps,
                  totalInRange: verifiedDriverAppsInRange,
               },
            },

            admins: {
               admins: totalAdmins,
               superAdmins: totalSuperAdmins,
            },

            guests: {
               // legacy
               uniqueInRange: Number(uniqueGuestsInRange) || 0,
               // new — total + totalInRange
               counts: {
                  total: Number(uniqueGuestsAllTime) || 0,
                  totalInRange: Number(uniqueGuestsInRange) || 0,
               },
            },

            // Сводная статистика по сегментам — для главного KPI-блока
            // («реальные», «боты», «гости», «все»). Удобно для фронта показывать
            // 4 карточки сразу, без сшивания из разных мест.
            segments: {
               real: {
                  total: usersTotalSeg.real,
                  totalInRange: usersInRangeSeg.real,
                  drivers: {
                     total: driversTotalSeg.real,
                     totalInRange: driversInRangeSeg.real,
                  },
                  passengers: {
                     total: passengersTotalSeg.real,
                     totalInRange: passengersInRangeSeg.real,
                  },
               },
               bots: {
                  total: usersTotalSeg.bots,
                  totalInRange: usersInRangeSeg.bots,
                  drivers: {
                     total: driversTotalSeg.bots,
                     totalInRange: driversInRangeSeg.bots,
                  },
                  passengers: {
                     total: passengersTotalSeg.bots,
                     totalInRange: passengersInRangeSeg.bots,
                  },
               },
               guests: {
                  total: Number(uniqueGuestsAllTime) || 0,
                  totalInRange: Number(uniqueGuestsInRange) || 0,
               },
               all: {
                  // «всё что шевелится в БД»: users(real+bots) + guests
                  total: usersTotalSeg.all + (Number(uniqueGuestsAllTime) || 0),
                  totalInRange:
                     usersInRangeSeg.all + (Number(uniqueGuestsInRange) || 0),
                  drivers: {
                     total: driversTotalSeg.all,
                     totalInRange: driversInRangeSeg.all,
                  },
                  passengers: {
                     total: passengersTotalSeg.all,
                     totalInRange: passengersInRangeSeg.all,
                  },
               },
            },

            // Дублируем активные поездки на верхнем уровне overview, чтобы фронт
            // мог рисовать карточку «прямо сейчас в пути / готовятся к отправлению»
            // без отдельного запроса.
            activeTrips: activeTripsSnapshot,
         };
      },
      300,
   );
};

// 2. USERS — углублённая статистика по пользователям (страница /users)
export const getUsersStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_users_v2_${range.key}`;

   // legacy: real-only in-range
   const baseWhere = {
      createdAt: { [Op.between]: [range.start, range.end] },
      registration_source: RegistrationSource.User,
   };
   const rangeWhere = { createdAt: { [Op.between]: [range.start, range.end] } };

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            byRole,
            byGender,
            byLanguage,
            bySource,
            verified,
            passportVerified,
            banned,
            walletBlocked,
            withPromo,
            // in-range flags (real-only — production-ready)
            verifiedInRange,
            passportVerifiedInRange,
            bannedInRange,
            walletBlockedInRange,
            withPromoInRange,
            newUsersGraph,
            newUsersGraphAll,
            byHour,
            topDriversByTrips,
            topPassengersByBookings,
            usersBySourceAllTime,
            newUsersBySource,
            dauMauData,
            totalUsersInRange,
            totalPassengersInRange,
            totalDriversInRange,
            // segmented totals
            usersTotalSeg,
            usersInRangeSeg,
            driversTotalSeg,
            driversInRangeSeg,
            passengersTotalSeg,
            passengersInRangeSeg,
            uniqueGuestsAllTime,
            uniqueGuestsInRange,
         ] = await Promise.all([
            User.findAll({
               attributes: [
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['role'],
               raw: true,
            }),
            User.findAll({
               attributes: [
                  'gender',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['gender'],
               raw: true,
            }),
            User.findAll({
               attributes: [
                  'preferred_language',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['preferred_language'],
               raw: true,
            }),
            User.findAll({
               attributes: [
                  'registration_source',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['registration_source'],
               raw: true,
            }),
            // legacy flags (all-time, ВСЕ источники — старое поведение)
            User.count({ where: { verified: true } }),
            User.count({ where: { passport_verified: true } }),
            User.count({ where: { isBanned: true } }),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(*)::text AS count FROM users WHERE is_wallet_blocked = true;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10))
               .catch(() => 0),
            User.count({ where: { isHavePromocode: true } }),
            // new flags in-range (real-only)
            User.count({ where: { ...baseWhere, verified: true } }),
            User.count({
               where: { ...baseWhere, passport_verified: true },
            }),
            User.count({ where: { ...baseWhere, isBanned: true } }),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(*)::text AS count FROM users
                    WHERE is_wallet_blocked = true
                      AND registration_source = 'user'
                      AND "createdAt" BETWEEN :start AND :end;`,
                  {
                     type: QueryTypes.SELECT,
                     replacements: { start: range.start, end: range.end },
                  },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10))
               .catch(() => 0),
            User.count({ where: { ...baseWhere, isHavePromocode: true } }),
            // graph real-only — производственная чистая линия регистраций
            buildTimeSeries(User, 'createdAt', range, REAL_WHERE),
            // graph all — для compare-режима
            buildTimeSeries(User, 'createdAt', range),
            db.query<{ hour: string; count: string }>(
               `SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::text AS count
                  FROM users
                 WHERE "createdAt" BETWEEN :start AND :end
                 GROUP BY hour
                 ORDER BY hour;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber", u.rating,
                       COUNT(t.id)::int AS trips_count
                  FROM users u
             LEFT JOIN trips t ON t.driver_id = u.id
                 WHERE u.role = 'Driver'
              GROUP BY u.id
              ORDER BY trips_count DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber",
                       COUNT(b.id)::int AS bookings_count
                  FROM users u
             LEFT JOIN bookings b ON b."passengerId" = u.id
                 WHERE u.role = 'Passenger'
              GROUP BY u.id
              ORDER BY bookings_count DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            User.findAll({
               attributes: [
                  'registration_source',
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['registration_source', 'role'],
               raw: true,
            }) as unknown as Promise<
               Array<{
                  registration_source: string;
                  role: string;
                  count: string;
               }>
            >,
            User.findAll({
               attributes: [
                  'registration_source',
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               where: {
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               group: ['registration_source', 'role'],
               raw: true,
            }) as unknown as Promise<
               Array<{
                  registration_source: string;
                  role: string;
                  count: string;
               }>
            >,
            getDauMauSegmentation(),
            User.count({ where: baseWhere }),

            User.count({
               where: {
                  ...baseWhere,
                  role: UserRole.Passenger,
               },
            }),

            User.count({
               where: {
                  ...baseWhere,
                  role: UserRole.Driver,
               },
            }),

            // segmented totals
            countUsersSegmented(),
            countUsersSegmented(rangeWhere),
            countUsersSegmented({ role: UserRole.Driver }),
            countUsersSegmented({ ...rangeWhere, role: UserRole.Driver }),
            countUsersSegmented({ role: UserRole.Passenger }),
            countUsersSegmented({ ...rangeWhere, role: UserRole.Passenger }),
            Search.count({
               where: { userId: null, guestId: { [Op.ne]: null } },
               distinct: true,
               col: 'guestId',
            }),
            Search.count({
               where: {
                  userId: null,
                  guestId: { [Op.ne]: null },
                  created_at: { [Op.between]: [range.start, range.end] },
               },
               distinct: true,
               col: 'guestId',
            }),
         ]);

         return {
            ...wrapRange(range),
            // legacy
            totalInRange: totalUsersInRange,
            passengerInRange: totalPassengersInRange,
            driversInRange: totalDriversInRange,
            distribution: {
               byRole: byRole as any[],
               byGender: byGender as any[],
               byLanguage: byLanguage as any[],
               bySource: bySource as any[],
            },
            flags: {
               // legacy (all-time, all sources)
               verified,
               passportVerified,
               banned,
               walletBlocked,
               withPromocode: withPromo,
               // new: total + totalInRange (real-only)
               verifiedCounts: {
                  total: verified,
                  totalInRange: verifiedInRange,
               },
               passportVerifiedCounts: {
                  total: passportVerified,
                  totalInRange: passportVerifiedInRange,
               },
               bannedCounts: {
                  total: banned,
                  totalInRange: bannedInRange,
               },
               walletBlockedCounts: {
                  total: walletBlocked,
                  totalInRange: walletBlockedInRange,
               },
               withPromocodeCounts: {
                  total: withPromo,
                  totalInRange: withPromoInRange,
               },
            },
            segmentation: {
               allTime: aggregateUsersSource(usersBySourceAllTime),
               newInRange: aggregateUsersSource(newUsersBySource),
            },
            dauMau: dauMauData,
            registrations: {
               graph: formatSeries(newUsersGraph as any[], range),
               graphAll: formatSeries(newUsersGraphAll as any[], range),
               byHourOfDay: (byHour as any[]).map((r) => ({
                  hour: parseInt(String(r.hour), 10),
                  count: parseInt(String(r.count), 10),
               })),
            },
            top: {
               driversByTrips: topDriversByTrips,
               passengersByBookings: topPassengersByBookings,
            },

            // ─── new production-ready shape ────────────────────────────
            counts: {
               total: usersTotalSeg,
               totalInRange: usersInRangeSeg,
            },
            driversCounts: {
               total: driversTotalSeg,
               totalInRange: driversInRangeSeg,
            },
            passengersCounts: {
               total: passengersTotalSeg,
               totalInRange: passengersInRangeSeg,
            },
            guestsCounts: {
               total: Number(uniqueGuestsAllTime) || 0,
               totalInRange: Number(uniqueGuestsInRange) || 0,
            },
            segments: {
               real: {
                  total: usersTotalSeg.real,
                  totalInRange: usersInRangeSeg.real,
                  drivers: {
                     total: driversTotalSeg.real,
                     totalInRange: driversInRangeSeg.real,
                  },
                  passengers: {
                     total: passengersTotalSeg.real,
                     totalInRange: passengersInRangeSeg.real,
                  },
               },
               bots: {
                  total: usersTotalSeg.bots,
                  totalInRange: usersInRangeSeg.bots,
                  drivers: {
                     total: driversTotalSeg.bots,
                     totalInRange: driversInRangeSeg.bots,
                  },
                  passengers: {
                     total: passengersTotalSeg.bots,
                     totalInRange: passengersInRangeSeg.bots,
                  },
               },
               guests: {
                  total: Number(uniqueGuestsAllTime) || 0,
                  totalInRange: Number(uniqueGuestsInRange) || 0,
               },
               all: {
                  total: usersTotalSeg.all + (Number(uniqueGuestsAllTime) || 0),
                  totalInRange:
                     usersInRangeSeg.all + (Number(uniqueGuestsInRange) || 0),
                  drivers: {
                     total: driversTotalSeg.all,
                     totalInRange: driversInRangeSeg.all,
                  },
                  passengers: {
                     total: passengersTotalSeg.all,
                     totalInRange: passengersInRangeSeg.all,
                  },
               },
            },
         };
      },
      300,
   );
};

// 3. TRIPS — статистика по поездкам (страница /trips)
export const getTripsStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_trips_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            byStatus,
            createdGraph,
            completedGraph,
            avgPrice,
            avgSeats,
            topRoutes,
            topDepartureCities,
            topArrivalCities,
            topDriversByTrips,
            cancellationsBreakdown,
            byBookingType,
            avgFillRate,
            activeTripsSnapshot,
            // new — total + totalInRange + byStatusInRange
            totalTrips,
            totalTripsInRange,
            createdTotal,
            inProgressTotal,
            completedTotal,
            canceledTotal,
            createdInRangeCount,
            inProgressInRangeCount,
            completedInRangeCount,
            canceledInRangeCount,
         ] = await Promise.all([
            Trip.findAll({
               attributes: [
                  'status',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['status'],
               raw: true,
            }),
            buildTimeSeries(Trip, 'created_at', range),
            buildTimeSeries(Trip, 'updated_at', range, {
               status: TripStatus.Completed,
            }),
            Trip.findOne({
               attributes: [
                  [
                     Sequelize.fn('AVG', Sequelize.col('price_per_person')),
                     'avg',
                  ],
               ],
               where: {
                  created_at: { [Op.between]: [range.start, range.end] },
               },
               raw: true,
            }),
            Trip.findOne({
               attributes: [
                  [
                     Sequelize.fn('AVG', Sequelize.col('seats_available')),
                     'avg',
                  ],
               ],
               where: {
                  created_at: { [Op.between]: [range.start, range.end] },
               },
               raw: true,
            }),
            db.query(
               `SELECT from_city, to_city, COUNT(*)::int AS count,
                       AVG(price_per_person)::int AS avg_price
                  FROM trips
              GROUP BY from_city, to_city
              ORDER BY count DESC
                 LIMIT 15;`,
               { type: QueryTypes.SELECT },
            ),
            Trip.findAll({
               attributes: [
                  'from_city',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['from_city'],
               order: [[Sequelize.literal('count'), 'DESC']],
               limit: 10,
               raw: true,
            }),
            Trip.findAll({
               attributes: [
                  'to_city',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['to_city'],
               order: [[Sequelize.literal('count'), 'DESC']],
               limit: 10,
               raw: true,
            }),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber",
                       COUNT(t.id)::int AS trips_count
                  FROM users u
                  JOIN trips t ON t.driver_id = u.id
                 WHERE t.created_at BETWEEN :start AND :end
              GROUP BY u.id
              ORDER BY trips_count DESC
                 LIMIT 10;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            buildTimeSeries(Trip, 'updated_at', range, {
               status: TripStatus.Canceled,
            }),
            Trip.findAll({
               attributes: [
                  'booking_type',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['booking_type'],
               raw: true,
            }),
            // Avg fill rate (booked seats / declared seats) для поездок в диапазоне
            db
               .query<{ fill_rate: string }>(
                  `WITH trip_seats AS (
                   SELECT t.id,
                          t.seats_available + COALESCE(SUM(b."seatsBooked") FILTER (WHERE b.status = 'CONFIRMED'), 0) AS total_seats,
                          COALESCE(SUM(b."seatsBooked") FILTER (WHERE b.status = 'CONFIRMED'), 0) AS booked_seats
                     FROM trips t
                LEFT JOIN bookings b ON b."tripId" = t.id
                    WHERE t.created_at BETWEEN :start AND :end
                 GROUP BY t.id
                )
                SELECT (AVG(NULLIF(booked_seats::numeric / NULLIF(total_seats, 0), 0)) * 100)::numeric(5,2)::text AS fill_rate
                  FROM trip_seats
                 WHERE total_seats > 0;`,
                  {
                     type: QueryTypes.SELECT,
                     replacements: { start: range.start, end: range.end },
                  },
               )
               .then((r) => parseFloat(r[0]?.fill_rate ?? '0')),
            getActiveTripsSnapshot(),
            // Total + range counts
            Trip.count(),
            Trip.count({
               where: {
                  created_at: { [Op.between]: [range.start, range.end] },
               },
            }),
            Trip.count({ where: { status: TripStatus.Created } }),
            Trip.count({ where: { status: TripStatus.InProgress } }),
            Trip.count({ where: { status: TripStatus.Completed } }),
            Trip.count({ where: { status: TripStatus.Canceled } }),
            Trip.count({
               where: {
                  status: TripStatus.Created,
                  created_at: { [Op.between]: [range.start, range.end] },
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.InProgress,
                  created_at: { [Op.between]: [range.start, range.end] },
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.Completed,
                  updated_at: { [Op.between]: [range.start, range.end] },
               },
            }),
            Trip.count({
               where: {
                  status: TripStatus.Canceled,
                  updated_at: { [Op.between]: [range.start, range.end] },
               },
            }),
         ]);

         return {
            ...wrapRange(range),
            // legacy
            byStatus: byStatus as any[],
            byBookingType: byBookingType as any[],
            timeSeries: {
               created: formatSeries(createdGraph as any[], range),
               completed: formatSeries(completedGraph as any[], range),
               canceled: formatSeries(cancellationsBreakdown as any[], range),
            },
            averages: {
               pricePerPerson: parseFloat((avgPrice as any)?.avg ?? '0'),
               seatsAvailable: parseFloat((avgSeats as any)?.avg ?? '0'),
               fillRatePercent: avgFillRate,
            },
            top: {
               routes: topRoutes,
               departureCities: topDepartureCities,
               arrivalCities: topArrivalCities,
               driversByTrips: topDriversByTrips,
            },
            active: activeTripsSnapshot,

            // new — production-ready
            counts: {
               total: totalTrips,
               totalInRange: totalTripsInRange,
            },
            byStatusTotals: {
               CREATED: {
                  total: createdTotal,
                  totalInRange: createdInRangeCount,
               },
               IN_PROGRESS: {
                  total: inProgressTotal,
                  totalInRange: inProgressInRangeCount,
               },
               COMPLETED: {
                  total: completedTotal,
                  totalInRange: completedInRangeCount,
               },
               CANCELED: {
                  total: canceledTotal,
                  totalInRange: canceledInRangeCount,
               },
            },
            rates: {
               completionRateAllTime: safeRatio(completedTotal, totalTrips),
               completionRateInRange: safeRatio(
                  completedInRangeCount,
                  totalTripsInRange,
               ),
               cancellationRateAllTime: safeRatio(canceledTotal, totalTrips),
               cancellationRateInRange: safeRatio(
                  canceledInRangeCount,
                  totalTripsInRange,
               ),
            },
         };
      },
      300,
   );
};

// 4. WALLET — финансовая статистика (страница /wallet)
export const getWalletStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_wallet_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            totalBalance,
            balanceDistribution,
            byType,
            byStatus,
            sumByType,
            topUpsGraph,
            avgTopUp,
            topUpsCount,
            blockedWallets,
            topUsersByBalance,
            // new — total + range
            byTypeAllTime,
            byStatusAllTime,
            sumByTypeAllTime,
            topUpsTotal,
            topUpsTotalAllTime,
            paymentsTotal,
            paymentsTotalAllTime,
            paymentsCount,
            paymentsCountAllTime,
            refundsTotal,
            refundsTotalAllTime,
            commissionTotal,
            commissionTotalAllTime,
            withdrawalTotal,
            withdrawalTotalAllTime,
            avgTopUpAllTime,
            topUpsCountAllTime,
         ] = await Promise.all([
            Wallet.sum('balance').then((v) => v ?? 0),
            db.query(
               `SELECT
                   CASE
                     WHEN balance = 0 THEN 'zero'
                     WHEN balance < 0 THEN 'negative'
                     WHEN balance < 50000 THEN 'lt_50k'
                     WHEN balance < 200000 THEN 'lt_200k'
                     WHEN balance < 1000000 THEN 'lt_1m'
                     ELSE 'gte_1m'
                   END AS bucket,
                   COUNT(*)::int AS count,
                   SUM(balance)::numeric AS sum
                 FROM wallets
                GROUP BY bucket
                ORDER BY bucket;`,
               { type: QueryTypes.SELECT },
            ),
            Transaction.findAll({
               attributes: [
                  'type',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               where: {
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               group: ['type'],
               raw: true,
            }),
            Transaction.findAll({
               attributes: [
                  'status',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               where: {
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               group: ['status'],
               raw: true,
            }),
            Transaction.findAll({
               attributes: [
                  'type',
                  [Sequelize.fn('SUM', Sequelize.col('amount')), 'sum'],
               ],
               where: {
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               group: ['type'],
               raw: true,
            }),
            buildTimeSeries(
               Transaction,
               'createdAt',
               range,
               {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
               },
               { aggregate: 'sum', sumColumn: 'amount' },
            ),
            Transaction.findOne({
               attributes: [
                  [Sequelize.fn('AVG', Sequelize.col('amount')), 'avg'],
               ],
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               raw: true,
            }),
            Transaction.count({
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(*)::text AS count FROM users WHERE is_wallet_blocked = true;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10))
               .catch(() => 0),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber", w.balance::numeric AS balance
                  FROM wallets w
                  JOIN users u ON u.id = w.user_id
              ORDER BY w.balance DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            // ─── new: total + range distributions
            Transaction.findAll({
               attributes: [
                  'type',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['type'],
               raw: true,
            }),
            Transaction.findAll({
               attributes: [
                  'status',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['status'],
               raw: true,
            }),
            Transaction.findAll({
               attributes: [
                  'type',
                  [Sequelize.fn('SUM', Sequelize.col('amount')), 'sum'],
               ],
               where: { status: TransactionStatus.COMPLETED },
               group: ['type'],
               raw: true,
            }),
            // Top-ups (DEPOSIT) — completed sum, in-range
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            // Payments
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            Transaction.count({
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Transaction.count({
               where: {
                  type: TransactionType.PAYMENT,
                  status: TransactionStatus.COMPLETED,
               },
            }),
            // Refunds
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.REFUND,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.REFUND,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            // Commission
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.COMMISSION,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.COMMISSION,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            // Withdrawals
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.WITHDRAWAL,
                  status: TransactionStatus.COMPLETED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Transaction.sum('amount', {
               where: {
                  type: TransactionType.WITHDRAWAL,
                  status: TransactionStatus.COMPLETED,
               },
            }).then((v) => v ?? 0),
            // Avg top-up + count all-time
            Transaction.findOne({
               attributes: [
                  [Sequelize.fn('AVG', Sequelize.col('amount')), 'avg'],
               ],
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
               },
               raw: true,
            }),
            Transaction.count({
               where: {
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.COMPLETED,
               },
            }),
         ]);

         return {
            ...wrapRange(range),
            // legacy
            balance: {
               total: Number(totalBalance),
               distribution: balanceDistribution,
            },
            transactions: {
               byType: byType as any[],
               byStatus: byStatus as any[],
               sumByCompletedType: sumByType as any[],
               // new
               byTypeAllTime: byTypeAllTime as any[],
               byStatusAllTime: byStatusAllTime as any[],
               sumByCompletedTypeAllTime: sumByTypeAllTime as any[],
            },
            topUps: {
               graph: formatSeries(topUpsGraph as any[], range),
               // legacy "total" = sum of graph series in-range
               total: sumSeries(formatSeries(topUpsGraph as any[], range)),
               averageInRange: parseFloat((avgTopUp as any)?.avg ?? '0'),
               count: topUpsCount,
               // new
               counts: {
                  total: topUpsCountAllTime,
                  totalInRange: topUpsCount,
               },
               sums: {
                  total: Number(topUpsTotalAllTime),
                  totalInRange: Number(topUpsTotal),
               },
               average: {
                  total: parseFloat((avgTopUpAllTime as any)?.avg ?? '0'),
                  totalInRange: parseFloat((avgTopUp as any)?.avg ?? '0'),
               },
            },
            blocked: {
               walletBlockedUsers: blockedWallets,
            },
            top: {
               usersByBalance: topUsersByBalance,
            },

            // ─── new production-ready: financial flows ──────────────────
            payments: {
               counts: {
                  total: paymentsCountAllTime,
                  totalInRange: paymentsCount,
               },
               sums: {
                  total: Number(paymentsTotalAllTime),
                  totalInRange: Number(paymentsTotal),
               },
            },
            refunds: {
               sums: {
                  total: Number(refundsTotalAllTime),
                  totalInRange: Number(refundsTotal),
               },
            },
            commission: {
               sums: {
                  total: Number(commissionTotalAllTime),
                  totalInRange: Number(commissionTotal),
               },
            },
            withdrawals: {
               sums: {
                  total: Number(withdrawalTotalAllTime),
                  totalInRange: Number(withdrawalTotal),
               },
            },
         };
      },
      120,
   );
};

// 5. ACTIVE TRIPS — снапшот текущей нагрузки (страница /active-trips)
//
// Возвращает полный «оперативный» дашборд по поездкам в активных статусах:
//   IN_PROGRESS — едут прямо сейчас (водитель нажал «начать»)
//   CREATED      — будущие поездки, ещё не стартовали
// Помимо счётчиков и таймингов отдаёт:
//   • список IN_PROGRESS поездок со всеми деталями (маршрут, цена, бронирования,
//     водитель, машина, даты);
//   • список ближайших CREATED поездок (departure_ts в ближайшие 24ч);
//   • финансовые агрегаты (выручка/потенциал), фактическую загрузку мест,
//     топ-маршруты и топ-городов отправления/прибытия.

const ACTIVE_TRIP_STATUSES = [TripStatus.InProgress, TripStatus.Created];

/**
 * Лёгкий снапшот активных поездок без тяжёлых include-ов и списков —
 * для встраивания в overview / trips статистики. Кэш отдельный, чтобы не
 * пересчитывать на каждый вызов и не зависеть от TTL «больших» эндпоинтов.
 */
export const getActiveTripsSnapshot = async () => {
   return getOrSetCache(
      'admin_stats_active_trips_snapshot',
      async () => {
         const [aggRows, todayCount, startedLast24h] = await Promise.all([
            db.query<{
               status: string;
               trips_count: string;
               confirmed_bookings: string;
               pending_bookings: string;
               seats_booked: string;
               seats_available: string;
               bookings_revenue: string;
               potential_revenue: string;
            }>(
               `WITH active_trips AS (
                  SELECT id, status, seats_available, price_per_person
                    FROM trips
                   WHERE status IN ('IN_PROGRESS','CREATED')
               ),
               booking_agg AS (
                  SELECT b."tripId" AS trip_id,
                         COUNT(*) FILTER (WHERE b.status = 'CONFIRMED') AS confirmed_bookings,
                         COUNT(*) FILTER (WHERE b.status = 'PENDING')   AS pending_bookings,
                         COALESCE(SUM(b."seatsBooked") FILTER (WHERE b.status = 'CONFIRMED'), 0) AS seats_booked,
                         COALESCE(SUM(b."totalPrice")  FILTER (WHERE b.status = 'CONFIRMED'), 0) AS bookings_revenue
                    FROM bookings b
                   WHERE b.deleted_at IS NULL
                     AND b."tripId" IN (SELECT id FROM active_trips)
                   GROUP BY b."tripId"
               )
               SELECT at.status,
                      COUNT(*)::text AS trips_count,
                      COALESCE(SUM(ba.confirmed_bookings), 0)::text AS confirmed_bookings,
                      COALESCE(SUM(ba.pending_bookings), 0)::text   AS pending_bookings,
                      COALESCE(SUM(ba.seats_booked), 0)::text       AS seats_booked,
                      COALESCE(SUM(at.seats_available), 0)::text    AS seats_available,
                      COALESCE(SUM(ba.bookings_revenue), 0)::text   AS bookings_revenue,
                      COALESCE(SUM(at.price_per_person * at.seats_available), 0)::text AS potential_revenue
                 FROM active_trips at
            LEFT JOIN booking_agg ba ON ba.trip_id = at.id
             GROUP BY at.status;`,
               { type: QueryTypes.SELECT },
            ),
            Trip.count({
               where: {
                  status: { [Op.in]: ACTIVE_TRIP_STATUSES },
                  departure_ts: {
                     [Op.between]: [
                        new Date(new Date().setHours(0, 0, 0, 0)),
                        new Date(new Date().setHours(23, 59, 59, 999)),
                     ],
                  },
               },
            }),
            Trip.count({
               where: {
                  trip_start_ts: {
                     [Op.gte]: new Date(Date.now() - 24 * 3600 * 1000),
                  },
               },
            }),
         ]);

         const empty = {
            tripsCount: 0,
            confirmedBookings: 0,
            pendingBookings: 0,
            seatsBooked: 0,
            seatsAvailable: 0,
            bookingsRevenue: 0,
            potentialRevenue: 0,
         };
         const byStatus: Record<'IN_PROGRESS' | 'CREATED', typeof empty> = {
            IN_PROGRESS: { ...empty },
            CREATED: { ...empty },
         };
         for (const row of aggRows) {
            const key = row.status as 'IN_PROGRESS' | 'CREATED';
            if (!byStatus[key]) continue;
            byStatus[key] = {
               tripsCount: parseInt(row.trips_count, 10) || 0,
               confirmedBookings: parseInt(row.confirmed_bookings, 10) || 0,
               pendingBookings: parseInt(row.pending_bookings, 10) || 0,
               seatsBooked: parseInt(row.seats_booked, 10) || 0,
               seatsAvailable: parseInt(row.seats_available, 10) || 0,
               bookingsRevenue: parseFloat(row.bookings_revenue) || 0,
               potentialRevenue: parseFloat(row.potential_revenue) || 0,
            };
         }

         const totalSeatsBooked =
            byStatus.IN_PROGRESS.seatsBooked + byStatus.CREATED.seatsBooked;
         const totalSeatsAvailable =
            byStatus.IN_PROGRESS.seatsAvailable +
            byStatus.CREATED.seatsAvailable;
         const totalSeats = totalSeatsBooked + totalSeatsAvailable;

         return {
            counts: {
               inProgress: byStatus.IN_PROGRESS.tripsCount,
               created: byStatus.CREATED.tripsCount,
               totalActive:
                  byStatus.IN_PROGRESS.tripsCount + byStatus.CREATED.tripsCount,
               departingToday: todayCount,
               startedLast24h,
               confirmedBookings:
                  byStatus.IN_PROGRESS.confirmedBookings +
                  byStatus.CREATED.confirmedBookings,
               pendingBookings:
                  byStatus.IN_PROGRESS.pendingBookings +
                  byStatus.CREATED.pendingBookings,
            },
            seats: {
               total: totalSeats,
               booked: totalSeatsBooked,
               available: totalSeatsAvailable,
               fillRatePercent:
                  totalSeats > 0
                     ? Number(
                          ((totalSeatsBooked / totalSeats) * 100).toFixed(2),
                       )
                     : 0,
            },
            financials: {
               bookingsRevenue:
                  byStatus.IN_PROGRESS.bookingsRevenue +
                  byStatus.CREATED.bookingsRevenue,
               potentialRevenue:
                  byStatus.IN_PROGRESS.potentialRevenue +
                  byStatus.CREATED.potentialRevenue,
            },
            byStatus,
         };
      },
      60,
   );
};

const serializeActiveTrip = (trip: any) => {
   const bookings = (trip.bookings || []) as any[];
   const confirmedBookings = bookings.filter(
      (b) => b.status === BookingStatus.CONFIRMED,
   );
   const pendingBookings = bookings.filter(
      (b) => b.status === BookingStatus.PENDING,
   );
   const seatsBooked = confirmedBookings.reduce(
      (acc, b) => acc + (Number(b.seatsBooked) || 0),
      0,
   );
   const seatsAvailable = Number(trip.seats_available) || 0;
   const totalSeats = seatsAvailable + seatsBooked;
   const bookingsRevenue = confirmedBookings.reduce(
      (acc, b) => acc + (Number(b.totalPrice) || 0),
      0,
   );

   return {
      id: trip.id,
      status: trip.status,
      route: {
         from: {
            city: trip.from_city,
            address: trip.from_address,
            cityId: trip.from_city_id ?? null,
         },
         to: {
            city: trip.to_city,
            address: trip.to_address,
            cityId: trip.to_city_id ?? null,
         },
         distanceMeters: trip.distance ?? null,
         durationSeconds: trip.duration ?? null,
      },
      schedule: {
         departureTs: trip.departure_ts,
         arrivalTs: trip.arrival_ts ?? null,
         tripStartTs: trip.trip_start_ts ?? null,
         tripEndTs: trip.trip_end_ts ?? null,
         createdAt: trip.created_at,
         updatedAt: trip.updated_at,
      },
      pricing: {
         pricePerPerson: Number(trip.price_per_person) || 0,
         bookingsRevenue,
         potentialRevenue:
            (Number(trip.price_per_person) || 0) * seatsAvailable,
      },
      seats: {
         total: totalSeats,
         booked: seatsBooked,
         available: seatsAvailable,
         fillRatePercent:
            totalSeats > 0
               ? Number(((seatsBooked / totalSeats) * 100).toFixed(2))
               : 0,
      },
      bookings: {
         total: bookings.length,
         confirmed: confirmedBookings.length,
         pending: pendingBookings.length,
         list: bookings.map((b) => ({
            id: b.id,
            status: b.status,
            seatsBooked: Number(b.seatsBooked) || 0,
            totalPrice: Number(b.totalPrice) || 0,
            fromCity: b.from_city,
            toCity: b.to_city,
            createdAt: b.createdAt,
            passenger: b.passenger
               ? {
                    id: b.passenger.id,
                    firstName: b.passenger.firstName,
                    lastName: b.passenger.lastName,
                    phoneNumber: b.passenger.phoneNumber,
                    avatar: b.passenger.avatar,
                    rating: b.passenger.rating,
                 }
               : null,
         })),
      },
      driver: trip.driver
         ? {
              id: trip.driver.id,
              firstName: trip.driver.firstName,
              lastName: trip.driver.lastName,
              phoneNumber: trip.driver.phoneNumber,
              avatar: trip.driver.avatar,
              rating: trip.driver.rating,
           }
         : null,
      car: trip.car
         ? {
              id: trip.car.id,
              make: trip.car.make,
              model: trip.car.model,
              color: trip.car.color,
              govNumber: trip.car.govNumber,
           }
         : null,
      bookingType: trip.booking_type,
      comment: trip.comment ?? null,
   };
};

export interface ActiveTripsOptions {
   limit?: number;
   upcomingHours?: number;
}

export const getActiveTripsStatistics = async (
   opts: ActiveTripsOptions = {},
) => {
   const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
   const upcomingHours = Math.min(
      Math.max(Number(opts.upcomingHours) || 24, 1),
      168,
   );
   const cacheKey = `admin_stats_active_trips_${limit}_${upcomingHours}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const now = new Date();
         const todayStart = new Date(now);
         todayStart.setHours(0, 0, 0, 0);
         const todayEnd = new Date(now);
         todayEnd.setHours(23, 59, 59, 999);
         const upcomingWindowEnd = new Date(
            now.getTime() + upcomingHours * 3600 * 1000,
         );

         const driverInclude = {
            model: User,
            as: 'driver',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'phoneNumber',
               'avatar',
               'rating',
            ],
         };
         const carInclude = {
            model: Car,
            as: 'car',
            attributes: ['id', 'make', 'model', 'color', 'govNumber'],
         };
         const bookingsInclude = {
            model: Booking,
            as: 'bookings',
            required: false,
            where: {
               status: {
                  [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
               },
            },
            attributes: [
               'id',
               'status',
               'seatsBooked',
               'totalPrice',
               'from_city',
               'to_city',
               'passengerId',
               'createdAt',
            ],
            include: [
               {
                  model: User,
                  as: 'passenger',
                  attributes: [
                     'id',
                     'firstName',
                     'lastName',
                     'phoneNumber',
                     'avatar',
                     'rating',
                  ],
               },
            ],
         };

         const [
            inProgressCount,
            createdCount,
            byFromCity,
            byToCity,
            tripsToday,
            avgDuration,
            avgDelay,
            startedLast24h,
            inProgressTrips,
            upcomingTrips,
            activeAggregatesRows,
            topActiveRoutesRows,
         ] = await Promise.all([
            Trip.count({ where: { status: TripStatus.InProgress } }),
            Trip.count({ where: { status: TripStatus.Created } }),
            db.query(
               `SELECT from_city, COUNT(*)::int AS count
                  FROM trips
                 WHERE status IN ('IN_PROGRESS','CREATED')
              GROUP BY from_city
              ORDER BY count DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            db.query(
               `SELECT to_city, COUNT(*)::int AS count
                  FROM trips
                 WHERE status IN ('IN_PROGRESS','CREATED')
              GROUP BY to_city
              ORDER BY count DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            Trip.count({
               where: {
                  status: { [Op.in]: ACTIVE_TRIP_STATUSES },
                  departure_ts: { [Op.between]: [todayStart, todayEnd] },
               },
            }),
            db
               .query<{ avg_minutes: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM (trip_end_ts - trip_start_ts))/60)::numeric(10,2)::text AS avg_minutes
                  FROM trips
                 WHERE status = 'COMPLETED'
                   AND trip_start_ts IS NOT NULL
                   AND trip_end_ts IS NOT NULL
                   AND updated_at > NOW() - INTERVAL '30 days';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.avg_minutes ?? '0')),
            db
               .query<{ avg_minutes: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM (trip_start_ts - departure_ts))/60)::numeric(10,2)::text AS avg_minutes
                  FROM trips
                 WHERE status IN ('IN_PROGRESS', 'COMPLETED')
                   AND trip_start_ts IS NOT NULL
                   AND departure_ts IS NOT NULL
                   AND updated_at > NOW() - INTERVAL '30 days';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.avg_minutes ?? '0')),
            Trip.count({
               where: {
                  trip_start_ts: {
                     [Op.gte]: new Date(Date.now() - 24 * 3600 * 1000),
                  },
               },
            }),
            Trip.findAll({
               where: { status: TripStatus.InProgress },
               order: [['trip_start_ts', 'DESC']],
               limit,
               include: [driverInclude, carInclude, bookingsInclude],
            }),
            Trip.findAll({
               where: {
                  status: TripStatus.Created,
                  departure_ts: { [Op.between]: [now, upcomingWindowEnd] },
               },
               order: [['departure_ts', 'ASC']],
               limit,
               include: [driverInclude, carInclude, bookingsInclude],
            }),
            // Финансовые/seat-агрегаты по активным поездкам — одним SQL, чтобы не
            // тащить тысячи рядов в Node. Используем CTE: бронирования сначала
            // сворачиваем per-trip, чтобы LEFT JOIN не множил seats/price на каждое
            // бронирование. Затем агрегируем по статусу.
            db.query<{
               status: string;
               trips_count: string;
               confirmed_bookings: string;
               pending_bookings: string;
               seats_booked: string;
               seats_available: string;
               bookings_revenue: string;
               potential_revenue: string;
               avg_price_per_person: string;
            }>(
               `WITH active_trips AS (
                  SELECT id, status, seats_available, price_per_person,
                         from_city, to_city
                    FROM trips
                   WHERE status IN ('IN_PROGRESS','CREATED')
               ),
               booking_agg AS (
                  SELECT b."tripId" AS trip_id,
                         COUNT(*) FILTER (WHERE b.status = 'CONFIRMED') AS confirmed_bookings,
                         COUNT(*) FILTER (WHERE b.status = 'PENDING')   AS pending_bookings,
                         COALESCE(SUM(b."seatsBooked") FILTER (WHERE b.status = 'CONFIRMED'), 0) AS seats_booked,
                         COALESCE(SUM(b."totalPrice")  FILTER (WHERE b.status = 'CONFIRMED'), 0) AS bookings_revenue
                    FROM bookings b
                   WHERE b.deleted_at IS NULL
                     AND b."tripId" IN (SELECT id FROM active_trips)
                   GROUP BY b."tripId"
               )
               SELECT at.status,
                      COUNT(*)::text AS trips_count,
                      COALESCE(SUM(ba.confirmed_bookings), 0)::text AS confirmed_bookings,
                      COALESCE(SUM(ba.pending_bookings), 0)::text   AS pending_bookings,
                      COALESCE(SUM(ba.seats_booked), 0)::text       AS seats_booked,
                      COALESCE(SUM(at.seats_available), 0)::text    AS seats_available,
                      COALESCE(SUM(ba.bookings_revenue), 0)::text   AS bookings_revenue,
                      COALESCE(SUM(at.price_per_person * at.seats_available), 0)::text AS potential_revenue,
                      COALESCE(AVG(at.price_per_person), 0)::text   AS avg_price_per_person
                 FROM active_trips at
            LEFT JOIN booking_agg ba ON ba.trip_id = at.id
             GROUP BY at.status;`,
               { type: QueryTypes.SELECT },
            ),
            db.query<{
               from_city: string;
               to_city: string;
               trips_count: string;
               seats_available: string;
               seats_booked: string;
               revenue: string;
               avg_price: string;
            }>(
               `WITH active_trips AS (
                  SELECT id, seats_available, price_per_person, from_city, to_city
                    FROM trips
                   WHERE status IN ('IN_PROGRESS','CREATED')
               ),
               booking_agg AS (
                  SELECT b."tripId" AS trip_id,
                         COALESCE(SUM(b."seatsBooked") FILTER (WHERE b.status = 'CONFIRMED'), 0) AS seats_booked,
                         COALESCE(SUM(b."totalPrice")  FILTER (WHERE b.status = 'CONFIRMED'), 0) AS revenue
                    FROM bookings b
                   WHERE b.deleted_at IS NULL
                     AND b."tripId" IN (SELECT id FROM active_trips)
                   GROUP BY b."tripId"
               )
               SELECT at.from_city,
                      at.to_city,
                      COUNT(*)::text AS trips_count,
                      COALESCE(SUM(at.seats_available), 0)::text AS seats_available,
                      COALESCE(SUM(ba.seats_booked), 0)::text    AS seats_booked,
                      COALESCE(SUM(ba.revenue), 0)::text         AS revenue,
                      COALESCE(AVG(at.price_per_person), 0)::text AS avg_price
                 FROM active_trips at
            LEFT JOIN booking_agg ba ON ba.trip_id = at.id
             GROUP BY at.from_city, at.to_city
             ORDER BY trips_count DESC
                LIMIT 15;`,
               { type: QueryTypes.SELECT },
            ),
         ]);

         const emptyAgg = {
            tripsCount: 0,
            confirmedBookings: 0,
            pendingBookings: 0,
            seatsBooked: 0,
            seatsAvailable: 0,
            bookingsRevenue: 0,
            potentialRevenue: 0,
            avgPricePerPerson: 0,
         };
         const byStatusAgg: Record<string, typeof emptyAgg> = {
            IN_PROGRESS: { ...emptyAgg },
            CREATED: { ...emptyAgg },
         };
         for (const row of activeAggregatesRows) {
            const key = row.status;
            if (!byStatusAgg[key]) continue;
            byStatusAgg[key] = {
               tripsCount: parseInt(row.trips_count, 10) || 0,
               confirmedBookings: parseInt(row.confirmed_bookings, 10) || 0,
               pendingBookings: parseInt(row.pending_bookings, 10) || 0,
               seatsBooked: parseInt(row.seats_booked, 10) || 0,
               seatsAvailable: parseInt(row.seats_available, 10) || 0,
               bookingsRevenue: parseFloat(row.bookings_revenue) || 0,
               potentialRevenue: parseFloat(row.potential_revenue) || 0,
               avgPricePerPerson: parseFloat(row.avg_price_per_person) || 0,
            };
         }

         const totalActive =
            byStatusAgg.IN_PROGRESS.tripsCount + byStatusAgg.CREATED.tripsCount;
         const totalBookingsRevenue =
            byStatusAgg.IN_PROGRESS.bookingsRevenue +
            byStatusAgg.CREATED.bookingsRevenue;
         const totalPotentialRevenue =
            byStatusAgg.IN_PROGRESS.potentialRevenue +
            byStatusAgg.CREATED.potentialRevenue;
         const totalSeatsAvailable =
            byStatusAgg.IN_PROGRESS.seatsAvailable +
            byStatusAgg.CREATED.seatsAvailable;
         const totalSeatsBooked =
            byStatusAgg.IN_PROGRESS.seatsBooked +
            byStatusAgg.CREATED.seatsBooked;
         const totalSeats = totalSeatsAvailable + totalSeatsBooked;
         const fillRate =
            totalSeats > 0
               ? Number(((totalSeatsBooked / totalSeats) * 100).toFixed(2))
               : 0;

         const topRoutes = topActiveRoutesRows.map((r) => ({
            fromCity: r.from_city,
            toCity: r.to_city,
            tripsCount: parseInt(r.trips_count, 10) || 0,
            seatsAvailable: parseInt(r.seats_available, 10) || 0,
            seatsBooked: parseInt(r.seats_booked, 10) || 0,
            revenue: parseFloat(r.revenue) || 0,
            avgPrice: parseFloat(r.avg_price) || 0,
         }));

         return {
            generatedAt: now.toISOString(),
            counts: {
               inProgress: inProgressCount,
               created: createdCount,
               totalActive,
               departingToday: tripsToday,
               startedLast24h,
               upcomingInWindow: upcomingTrips.length,
               upcomingWindowHours: upcomingHours,
            },
            seats: {
               total: totalSeats,
               booked: totalSeatsBooked,
               available: totalSeatsAvailable,
               fillRatePercent: fillRate,
            },
            financials: {
               bookingsRevenue: totalBookingsRevenue,
               potentialRevenue: totalPotentialRevenue,
               grandTotalIfFull: totalBookingsRevenue + totalPotentialRevenue,
               byStatus: {
                  IN_PROGRESS: {
                     bookingsRevenue: byStatusAgg.IN_PROGRESS.bookingsRevenue,
                     potentialRevenue: byStatusAgg.IN_PROGRESS.potentialRevenue,
                     avgPricePerPerson:
                        byStatusAgg.IN_PROGRESS.avgPricePerPerson,
                  },
                  CREATED: {
                     bookingsRevenue: byStatusAgg.CREATED.bookingsRevenue,
                     potentialRevenue: byStatusAgg.CREATED.potentialRevenue,
                     avgPricePerPerson: byStatusAgg.CREATED.avgPricePerPerson,
                  },
               },
            },
            byStatus: byStatusAgg,
            byDepartureCity: byFromCity,
            byArrivalCity: byToCity,
            topRoutes,
            timing: {
               avgTripDurationMinutes: avgDuration,
               avgStartDelayMinutes: avgDelay,
            },
            trips: {
               inProgress: (inProgressTrips as any[]).map(serializeActiveTrip),
               upcoming: (upcomingTrips as any[]).map(serializeActiveTrip),
               listLimit: limit,
            },
         };
      },
      60,
   );
};

// 6. REPORTS — статистика по жалобам (страница /reports)
export const getReportsStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_reports_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            byStatus,
            createdGraph,
            resolvedGraph,
            avgResolutionMinutes,
            topReasons,
            topReportedUsers,
            totalTotal,
            totalInRange,
            pendingTotal,
            resolvedTotal,
            rejectedTotal,
            pendingInRange,
            resolvedInRange,
            rejectedInRange,
            avgResolutionMinutesInRange,
         ] = await Promise.all([
            Report.findAll({
               attributes: [
                  'status',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['status'],
               raw: true,
            }),
            buildTimeSeries(Report, 'createdAt', range),
            buildTimeSeries(Report, 'updatedAt', range, {
               status: {
                  [Op.in]: [ReportStatus.RESOLVED, ReportStatus.REJECTED],
               },
            }),
            db
               .query<{ avg_minutes: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))/60)::numeric(10,2)::text AS avg_minutes
                  FROM reports
                 WHERE status IN ('RESOLVED','REJECTED');`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.avg_minutes ?? '0')),
            db.query(
               `SELECT
                   CASE
                     WHEN length(reason) <= 60 THEN reason
                     ELSE substring(reason, 1, 60) || '…'
                   END AS reason,
                   COUNT(*)::int AS count
                  FROM reports
              GROUP BY 1
              ORDER BY count DESC
                 LIMIT 15;`,
               { type: QueryTypes.SELECT },
            ),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber",
                       COUNT(r.id)::int AS reports_count
                  FROM users u
                  JOIN reports r ON r."reportedUserId" = u.id
              GROUP BY u.id
              ORDER BY reports_count DESC
                 LIMIT 10;`,
               { type: QueryTypes.SELECT },
            ),
            // total + range
            Report.count(),
            Report.count({
               where: { createdAt: { [Op.between]: [range.start, range.end] } },
            }),
            Report.count({ where: { status: ReportStatus.PENDING } }),
            Report.count({ where: { status: ReportStatus.RESOLVED } }),
            Report.count({ where: { status: ReportStatus.REJECTED } }),
            Report.count({
               where: {
                  status: ReportStatus.PENDING,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Report.count({
               where: {
                  status: ReportStatus.RESOLVED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Report.count({
               where: {
                  status: ReportStatus.REJECTED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            db
               .query<{ avg_minutes: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))/60)::numeric(10,2)::text AS avg_minutes
                     FROM reports
                    WHERE status IN ('RESOLVED','REJECTED')
                      AND "createdAt" BETWEEN :start AND :end;`,
                  {
                     type: QueryTypes.SELECT,
                     replacements: { start: range.start, end: range.end },
                  },
               )
               .then((r) => parseFloat(r[0]?.avg_minutes ?? '0')),
         ]);

         return {
            ...wrapRange(range),
            // legacy
            byStatus: byStatus as any[],
            timeSeries: {
               created: formatSeries(createdGraph as any[], range),
               resolved: formatSeries(resolvedGraph as any[], range),
            },
            performance: {
               avgResolutionMinutes,
               // new
               avgResolutionMinutesInRange,
            },
            topReasons,
            topReportedUsers,

            // ─── new production-ready shape ────────────────────────────
            counts: {
               total: totalTotal,
               totalInRange,
            },
            byStatusTotals: {
               PENDING: { total: pendingTotal, totalInRange: pendingInRange },
               RESOLVED: {
                  total: resolvedTotal,
                  totalInRange: resolvedInRange,
               },
               REJECTED: {
                  total: rejectedTotal,
                  totalInRange: rejectedInRange,
               },
            },
            rates: {
               resolutionRateAllTime: safeRatio(resolvedTotal, totalTotal),
               resolutionRateInRange: safeRatio(resolvedInRange, totalInRange),
               rejectionRateAllTime: safeRatio(rejectedTotal, totalTotal),
               rejectionRateInRange: safeRatio(rejectedInRange, totalInRange),
            },
         };
      },
      300,
   );
};

// 7. ADMINS — активность админов (страница /admins)
export const getAdminsStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_admins_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            byRole,
            actionsByCategory,
            topActiveAdmins,
            actionsGraph,
            recentLogins,
         ] = await Promise.all([
            Admin.findAll({
               attributes: [
                  'role',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['role'],
               raw: true,
            }),
            AdminLog.findAll({
               attributes: [
                  'category',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               where: {
                  timestamp: { [Op.between]: [range.start, range.end] },
               },
               group: ['category'],
               raw: true,
            }),
            db.query(
               `SELECT a.id, a.email, a.role, a."firstName", a."lastName",
                       COUNT(al.id)::int AS actions_count,
                       MAX(al.timestamp) AS last_action_at
                  FROM admins a
             LEFT JOIN admin_logs al
                    ON al.admin_id = a.id
                   AND al.timestamp BETWEEN :start AND :end
              GROUP BY a.id
              ORDER BY actions_count DESC
                 LIMIT 20;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            buildTimeSeries(AdminLog, 'timestamp', range),
            db.query(
               `SELECT al.admin_id, al.admin_name, al.timestamp, al.ip_address, al.user_agent
                  FROM admin_logs al
                 WHERE al.action = 'Начал сессию'
              ORDER BY al.timestamp DESC
                 LIMIT 20;`,
               { type: QueryTypes.SELECT },
            ),
         ]);

         return {
            ...wrapRange(range),
            byRole: byRole as any[],
            actionsByCategory: actionsByCategory as any[],
            actionsGraph: formatSeries(actionsGraph as any[], range),
            topActiveAdmins,
            recentLogins,
         };
      },
      180,
   );
};

// 8. BOOKINGS — статистика по бронированиям (страница /bookings)
export const getBookingsStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_bookings_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            total,
            byStatus,
            createdGraph,
            confirmedGraph,
            cancelledGraph,
            totalRevenue,
            avgPrice,
            avgSeats,
            topRoutes,
            topPassengers,
            sourceBreakdown,
            totalInRange,
            confirmedTotal,
            pendingTotal,
            cancelledTotal,
            rejectedTotal,
            failedTotal,
            confirmedInRange,
            pendingInRange,
            cancelledInRange,
            rejectedInRange,
            failedInRange,
            revenueAllTime,
            sourceBreakdownAllTime,
         ] = await Promise.all([
            Booking.count(),
            Booking.findAll({
               attributes: [
                  'status',
                  [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
               ],
               group: ['status'],
               raw: true,
            }),
            buildTimeSeries(Booking, 'createdAt', range),
            buildTimeSeries(Booking, 'updatedAt', range, {
               status: BookingStatus.CONFIRMED,
            }),
            buildTimeSeries(Booking, 'updatedAt', range, {
               status: BookingStatus.CANCELLED,
            }),
            Booking.sum('totalPrice', {
               where: {
                  status: BookingStatus.CONFIRMED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }).then((v) => v ?? 0),
            Booking.findOne({
               attributes: [
                  [Sequelize.fn('AVG', Sequelize.col('totalPrice')), 'avg'],
               ],
               where: {
                  status: BookingStatus.CONFIRMED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               raw: true,
            }),
            Booking.findOne({
               attributes: [
                  [Sequelize.fn('AVG', Sequelize.col('seatsBooked')), 'avg'],
               ],
               where: {
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
               raw: true,
            }),
            db.query(
               `SELECT b.from_city, b.to_city, COUNT(*)::int AS count,
                       SUM(b."totalPrice")::numeric AS revenue
                  FROM bookings b
                 WHERE b."createdAt" BETWEEN :start AND :end
              GROUP BY b.from_city, b.to_city
              ORDER BY count DESC
                 LIMIT 15;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query(
               `SELECT u.id, u."firstName", u."lastName", u."phoneNumber",
                       u.registration_source,
                       COUNT(b.id)::int AS bookings_count,
                       SUM(b."totalPrice")::numeric AS spent
                  FROM users u
                  JOIN bookings b ON b."passengerId" = u.id
                 WHERE b."createdAt" BETWEEN :start AND :end
              GROUP BY u.id
              ORDER BY bookings_count DESC
                 LIMIT 10;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            // Сегментация бронирований по источнику регистрации пассажира (in-range)
            db.query<{ registration_source: string; count: string }>(
               `SELECT u.registration_source, COUNT(b.id)::text AS count
                  FROM bookings b
                  JOIN users u ON u.id = b."passengerId"
                 WHERE b."createdAt" BETWEEN :start AND :end
              GROUP BY u.registration_source;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            // total + totalInRange по статусам
            Booking.count({
               where: { createdAt: { [Op.between]: [range.start, range.end] } },
            }),
            Booking.count({ where: { status: BookingStatus.CONFIRMED } }),
            Booking.count({ where: { status: BookingStatus.PENDING } }),
            Booking.count({ where: { status: BookingStatus.CANCELLED } }),
            Booking.count({ where: { status: BookingStatus.REJECTED } }),
            Booking.count({ where: { status: BookingStatus.FAILED } }),
            Booking.count({
               where: {
                  status: BookingStatus.CONFIRMED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.PENDING,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.CANCELLED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.REJECTED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.count({
               where: {
                  status: BookingStatus.FAILED,
                  createdAt: { [Op.between]: [range.start, range.end] },
               },
            }),
            Booking.sum('totalPrice', {
               where: { status: BookingStatus.CONFIRMED },
            }).then((v) => v ?? 0),
            db.query<{ registration_source: string; count: string }>(
               `SELECT u.registration_source, COUNT(b.id)::text AS count
                  FROM bookings b
                  JOIN users u ON u.id = b."passengerId"
              GROUP BY u.registration_source;`,
               { type: QueryTypes.SELECT },
            ),
         ]);

         const bySourceFor = (
            rows: Array<{ registration_source: string; count: string }>,
         ) => {
            const out = { self: 0, botImported: 0, regBot: 0 };
            for (const row of rows) {
               const c = parseInt(row.count, 10) || 0;
               if (row.registration_source === 'from_bot') out.botImported += c;
               else if (row.registration_source === 'reg_bot') out.regBot += c;
               else out.self += c;
            }
            return out;
         };
         const bySource = bySourceFor(sourceBreakdown as any[]);
         const bySourceAllTime = bySourceFor(sourceBreakdownAllTime as any[]);

         return {
            ...wrapRange(range),
            // legacy
            total,
            byStatus: byStatus as any[],
            timeSeries: {
               created: formatSeries(createdGraph as any[], range),
               confirmed: formatSeries(confirmedGraph as any[], range),
               cancelled: formatSeries(cancelledGraph as any[], range),
            },
            financials: {
               revenueInRange: Number(totalRevenue),
               avgBookingPrice: parseFloat((avgPrice as any)?.avg ?? '0'),
               avgSeatsBooked: parseFloat((avgSeats as any)?.avg ?? '0'),
               // new
               revenueAllTime: Number(revenueAllTime),
            },
            top: {
               routes: topRoutes,
               passengers: topPassengers,
            },
            segmentation: {
               bySource, // legacy in-range
               // new
               bySourceInRange: bySource,
               bySourceAllTime: bySourceAllTime,
            },

            // ─── new production-ready shape ────────────────────────────
            counts: {
               total,
               totalInRange,
            },
            byStatusTotals: {
               CONFIRMED: {
                  total: confirmedTotal,
                  totalInRange: confirmedInRange,
               },
               PENDING: { total: pendingTotal, totalInRange: pendingInRange },
               CANCELLED: {
                  total: cancelledTotal,
                  totalInRange: cancelledInRange,
               },
               REJECTED: {
                  total: rejectedTotal,
                  totalInRange: rejectedInRange,
               },
               FAILED: { total: failedTotal, totalInRange: failedInRange },
            },
            rates: {
               confirmationRateAllTime: safeRatio(confirmedTotal, total),
               confirmationRateInRange: safeRatio(
                  confirmedInRange,
                  totalInRange,
               ),
               cancellationRateAllTime: safeRatio(cancelledTotal, total),
               cancellationRateInRange: safeRatio(
                  cancelledInRange,
                  totalInRange,
               ),
               rejectionRateAllTime: safeRatio(rejectedTotal, total),
               rejectionRateInRange: safeRatio(rejectedInRange, totalInRange),
            },
         };
      },
      300,
   );
};

// 9. SEARCHES / ROUTES — топ запросов: какие маршруты искали и какие города
//    (страница /searches для super-admin'а)
export const getSearchesStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_searches_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const [
            totalSearches,
            uniqueUsers,
            uniqueGuests,
            totalGraph,
            topRoutes,
            topFromCities,
            topToCities,
            byHour,
            byDayOfWeek,
            unmatchedRoutes,
            // new — total + range
            totalSearchesAllTime,
            uniqueUsersAllTime,
            uniqueGuestsAllTime,
            // segmented by source of user (real / bots / guests)
            searchesBySegmentInRange,
            searchesBySegmentAllTime,
         ] = await Promise.all([
            Search.count({
               where: {
                  created_at: { [Op.between]: [range.start, range.end] },
               },
            }),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(DISTINCT s."userId")::text AS count
                  FROM searches s
                 WHERE s."userId" IS NOT NULL
                   AND s.created_at BETWEEN :start AND :end;`,
                  {
                     type: QueryTypes.SELECT,
                     replacements: { start: range.start, end: range.end },
                  },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(DISTINCT s.guest_id)::text AS count
                  FROM searches s
                 WHERE s.guest_id IS NOT NULL
                   AND s.created_at BETWEEN :start AND :end;`,
                  {
                     type: QueryTypes.SELECT,
                     replacements: { start: range.start, end: range.end },
                  },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            buildTimeSeries(Search, 'created_at', range),
            db.query(
               `SELECT s.from_city, s.to_city, COUNT(*)::int AS count
                  FROM searches s
                 WHERE s.created_at BETWEEN :start AND :end
                   AND COALESCE(s.from_city, '') <> ''
                   AND COALESCE(s.to_city, '') <> ''
              GROUP BY s.from_city, s.to_city
              ORDER BY count DESC
                 LIMIT 30;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query(
               `SELECT s.from_city, COUNT(*)::int AS count
                  FROM searches s
                 WHERE s.created_at BETWEEN :start AND :end
                   AND COALESCE(s.from_city, '') <> ''
              GROUP BY s.from_city
              ORDER BY count DESC
                 LIMIT 20;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query(
               `SELECT s.to_city, COUNT(*)::int AS count
                  FROM searches s
                 WHERE s.created_at BETWEEN :start AND :end
                   AND COALESCE(s.to_city, '') <> ''
              GROUP BY s.to_city
              ORDER BY count DESC
                 LIMIT 20;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query<{ hour: string; count: string }>(
               `SELECT EXTRACT(HOUR FROM s.created_at)::int AS hour,
                       COUNT(*)::text AS count
                  FROM searches s
                 WHERE s.created_at BETWEEN :start AND :end
              GROUP BY hour
              ORDER BY hour;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            db.query<{ dow: string; count: string }>(
               `SELECT EXTRACT(DOW FROM s.created_at)::int AS dow,
                       COUNT(*)::text AS count
                  FROM searches s
                 WHERE s.created_at BETWEEN :start AND :end
              GROUP BY dow
              ORDER BY dow;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            // Маршруты, по которым ищут, но трипов нет — потенциальный спрос
            db.query(
               `SELECT s.from_city, s.to_city, COUNT(*)::int AS searches_count
                  FROM searches s
             LEFT JOIN trips t
                    ON LOWER(t.from_city) = LOWER(s.from_city)
                   AND LOWER(t.to_city) = LOWER(s.to_city)
                   AND t.created_at >= NOW() - INTERVAL '30 days'
                 WHERE s.created_at BETWEEN :start AND :end
                   AND COALESCE(s.from_city, '') <> ''
                   AND COALESCE(s.to_city, '') <> ''
                   AND t.id IS NULL
              GROUP BY s.from_city, s.to_city
              ORDER BY searches_count DESC
                 LIMIT 20;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            // ── all-time totals
            Search.count(),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(DISTINCT s."userId")::text AS count
                     FROM searches s
                    WHERE s."userId" IS NOT NULL;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            db
               .query<{ count: string }>(
                  `SELECT COUNT(DISTINCT s.guest_id)::text AS count
                     FROM searches s
                    WHERE s.guest_id IS NOT NULL;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.count ?? '0', 10)),
            // ── segmentation of searches by user source (real/bots) + guests, in-range
            db.query<{
               segment: string;
               searches: string;
               unique_actors: string;
            }>(
               `WITH s AS (
                  SELECT
                    CASE
                      WHEN se."userId" IS NULL AND se.guest_id IS NOT NULL THEN 'guests'
                      WHEN u.registration_source = 'user' THEN 'real'
                      WHEN u.registration_source IN ('from_bot','reg_bot') THEN 'bots'
                      ELSE 'unknown'
                    END AS segment,
                    se."userId" AS user_id,
                    se.guest_id AS guest_id
                    FROM searches se
                LEFT JOIN users u ON u.id = se."userId"
                   WHERE se.created_at BETWEEN :start AND :end
                )
                SELECT segment,
                       COUNT(*)::text AS searches,
                       COUNT(DISTINCT COALESCE(user_id::text, guest_id::text))::text AS unique_actors
                  FROM s
              GROUP BY segment;`,
               {
                  type: QueryTypes.SELECT,
                  replacements: { start: range.start, end: range.end },
               },
            ),
            // ── same, but all-time
            db.query<{
               segment: string;
               searches: string;
               unique_actors: string;
            }>(
               `WITH s AS (
                  SELECT
                    CASE
                      WHEN se."userId" IS NULL AND se.guest_id IS NOT NULL THEN 'guests'
                      WHEN u.registration_source = 'user' THEN 'real'
                      WHEN u.registration_source IN ('from_bot','reg_bot') THEN 'bots'
                      ELSE 'unknown'
                    END AS segment,
                    se."userId" AS user_id,
                    se.guest_id AS guest_id
                    FROM searches se
                LEFT JOIN users u ON u.id = se."userId"
                )
                SELECT segment,
                       COUNT(*)::text AS searches,
                       COUNT(DISTINCT COALESCE(user_id::text, guest_id::text))::text AS unique_actors
                  FROM s
              GROUP BY segment;`,
               { type: QueryTypes.SELECT },
            ),
         ]);

         const segmentRowsToObject = (
            rows: Array<{
               segment: string;
               searches: string;
               unique_actors: string;
            }>,
         ) => {
            const out = {
               real: { searches: 0, uniqueActors: 0 },
               bots: { searches: 0, uniqueActors: 0 },
               guests: { searches: 0, uniqueActors: 0 },
               unknown: { searches: 0, uniqueActors: 0 },
               all: { searches: 0, uniqueActors: 0 },
            };
            for (const r of rows) {
               const seg = (out as any)[r.segment] ?? out.unknown;
               seg.searches = parseInt(r.searches, 10) || 0;
               seg.uniqueActors = parseInt(r.unique_actors, 10) || 0;
               out.all.searches += seg.searches;
               out.all.uniqueActors += seg.uniqueActors;
            }
            return out;
         };

         const segInRange = segmentRowsToObject(
            searchesBySegmentInRange as any[],
         );
         const segAllTime = segmentRowsToObject(
            searchesBySegmentAllTime as any[],
         );

         return {
            ...wrapRange(range),
            // legacy
            counts: {
               totalSearches,
               uniqueUsers,
               uniqueGuests,
               // new
               total: totalSearchesAllTime,
               totalInRange: totalSearches,
               uniqueUsersTotal: uniqueUsersAllTime,
               uniqueUsersTotalInRange: uniqueUsers,
               uniqueGuestsTotal: uniqueGuestsAllTime,
               uniqueGuestsTotalInRange: uniqueGuests,
            },
            timeSeries: {
               total: formatSeries(totalGraph as any[], range),
            },
            top: {
               routes: topRoutes,
               fromCities: topFromCities,
               toCities: topToCities,
            },
            distribution: {
               byHour: (byHour as any[]).map((r) => ({
                  hour: parseInt(String(r.hour), 10),
                  count: parseInt(String(r.count), 10),
               })),
               byDayOfWeek: (byDayOfWeek as any[]).map((r) => ({
                  dayOfWeek: parseInt(String(r.dow), 10),
                  count: parseInt(String(r.count), 10),
               })),
            },
            unmatched: {
               // маршруты, по которым искали, но трипов за 30д не было — спрос без предложения
               routes: unmatchedRoutes,
            },

            // ─── new production-ready: segmented searches ───────────────
            segmentation: {
               allTime: segAllTime,
               inRange: segInRange,
            },
         };
      },
      300,
   );
};

// LEGACY — оставляем имена, к которым обращался старый контроллер
export const getAdvancedDashboardStatistics = async (
   range: 'day' | 'week' | 'month' = 'month',
) => getOverviewStatistics({ range });

export const getAdminDashboardStatistics = async () =>
   getOverviewStatistics({ range: 'month' });

export const getDashboardStatistics = getAdvancedDashboardStatistics;

// 10. ENGAGEMENT — production-grade метрики поведения реальных пользователей.
//
// Считается ТОЛЬКО по real-юзерам (registration_source='user'). Боты и гости
// сюда не попадают — это «чистая» статистика, которую можно показывать в KPI.
//
// Что внутри:
//   • funnel             — воронка: signup → first search → first booking →
//                          first confirmed booking → first completed trip;
//                          считается в выбранном диапазоне (когортный) И в общем.
//   • activity           — avg searches/bookings/trips на одного real-юзера
//                          (всего и в диапазоне).
//   • drivers            — real-водители: всего, с ≥1 поездкой, с ≥10 поездками,
//                          активные за 30 дней.
//   • repeatPassengers   — passenger retention: ≥2 / ≥5 подтверждённых бронирований.
//   • conversion         — search→booking, booking→confirmed, booking→completedTrip.
//   • timing             — медианное время от регистрации до первой поездки.
export const getEngagementStatistics = async (opts: RangeOptions = {}) => {
   const range = resolveRange(opts);
   const cacheKey = `admin_stats_engagement_v2_${range.key}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const replacements = { start: range.start, end: range.end };

         const [
            // ── Voronka / Funnel ───────────────────────────────────────
            // signups (real-only) в диапазоне
            signupsInRange,
            signupsAllTime,
            // first search per real user (когорта зарегавшихся в диапазоне)
            firstSearchCohort,
            // first booking per real user (когорта)
            firstBookingCohort,
            // first confirmed booking per real user (когорта)
            firstConfirmedCohort,
            // first completed trip per real user (когорта)
            firstCompletedCohort,

            // ── всего по платформе (real-only, all-time) ────────────────
            usersWithSearch,
            usersWithBooking,
            usersWithConfirmed,
            usersWithCompleted,

            // ── activity averages (real-only) ──────────────────────────
            searchesPerUserAllTime,
            searchesPerUserInRange,
            bookingsPerPassengerAllTime,
            bookingsPerPassengerInRange,
            tripsPerDriverAllTime,
            tripsPerDriverInRange,

            // ── drivers cohorts (real) ─────────────────────────────────
            realDriversTotal,
            driversWithAnyTrip,
            driversWith10Plus,
            driversActiveLast30d,

            // ── passenger retention (real) ─────────────────────────────
            passengersWith2PlusConfirmed,
            passengersWith5PlusConfirmed,

            // ── conversion (in-range) ──────────────────────────────────
            searchesCountInRange,
            bookingsCountInRange,
            confirmedBookingsCountInRange,
            completedTripsCountInRange,

            // ── timing: time-to-first ──────────────────────────────────
            avgDaysSignupToFirstBooking,
            medianDaysSignupToFirstBooking,
            avgDaysSignupToFirstTrip,
            medianDaysSignupToFirstTrip,
         ] = await Promise.all([
            // signups
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM users
                    WHERE registration_source = 'user'
                      AND "createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM users
                    WHERE registration_source = 'user';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            // first search для когорты зарегавшихся в range
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN searches s ON s."userId" = u.id
                    WHERE u.registration_source = 'user'
                      AND u."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            // first booking, когорта
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN bookings b ON b."passengerId" = u.id
                    WHERE u.registration_source = 'user'
                      AND u."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            // first confirmed booking, когорта
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN bookings b ON b."passengerId" = u.id
                    WHERE u.registration_source = 'user'
                      AND b.status = 'CONFIRMED'
                      AND u."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            // first completed trip, когорта (как водитель)
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN trips t ON t.driver_id = u.id
                    WHERE u.registration_source = 'user'
                      AND t.status = 'COMPLETED'
                      AND u."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),

            // all-time: «когда-либо» сделал X
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN searches s ON s."userId" = u.id
                    WHERE u.registration_source = 'user';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN bookings b ON b."passengerId" = u.id
                    WHERE u.registration_source = 'user';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN bookings b ON b."passengerId" = u.id
                    WHERE u.registration_source = 'user'
                      AND b.status = 'CONFIRMED';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT u.id)::text AS c
                     FROM users u
                     JOIN trips t ON t.driver_id = u.id
                    WHERE u.registration_source = 'user'
                      AND t.status = 'COMPLETED';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),

            // averages: searches per user
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(s.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN searches s ON s."userId" = u.id
                    WHERE u.registration_source = 'user';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(s.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN searches s ON s."userId" = u.id AND s.created_at BETWEEN :start AND :end
                    WHERE u.registration_source = 'user';`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            // bookings per real passenger
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(b.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN bookings b ON b."passengerId" = u.id
                    WHERE u.registration_source = 'user' AND u.role = 'Passenger';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(b.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN bookings b ON b."passengerId" = u.id AND b."createdAt" BETWEEN :start AND :end
                    WHERE u.registration_source = 'user' AND u.role = 'Passenger';`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            // trips per real driver
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(t.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN trips t ON t.driver_id = u.id
                    WHERE u.registration_source = 'user' AND u.role = 'Driver';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT (COUNT(t.id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0))::numeric(10,3)::text AS v
                     FROM users u
                LEFT JOIN trips t ON t.driver_id = u.id AND t.created_at BETWEEN :start AND :end
                    WHERE u.registration_source = 'user' AND u.role = 'Driver';`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),

            // drivers cohorts (real)
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM users
                    WHERE registration_source = 'user' AND role = 'Driver';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT t.driver_id)::text AS c
                     FROM trips t
                     JOIN users u ON u.id = t.driver_id
                    WHERE u.registration_source = 'user';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM (
                     SELECT t.driver_id
                       FROM trips t
                       JOIN users u ON u.id = t.driver_id
                      WHERE u.registration_source = 'user'
                   GROUP BY t.driver_id
                     HAVING COUNT(*) >= 10
                   ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(DISTINCT t.driver_id)::text AS c
                     FROM trips t
                     JOIN users u ON u.id = t.driver_id
                    WHERE u.registration_source = 'user'
                      AND t.trip_start_ts IS NOT NULL
                      AND t.trip_start_ts >= NOW() - INTERVAL '30 days';`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),

            // passengers with 2+/5+ confirmed bookings (real)
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM (
                     SELECT b."passengerId"
                       FROM bookings b
                       JOIN users u ON u.id = b."passengerId"
                      WHERE u.registration_source = 'user' AND b.status = 'CONFIRMED'
                   GROUP BY b."passengerId"
                     HAVING COUNT(*) >= 2
                   ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c FROM (
                     SELECT b."passengerId"
                       FROM bookings b
                       JOIN users u ON u.id = b."passengerId"
                      WHERE u.registration_source = 'user' AND b.status = 'CONFIRMED'
                   GROUP BY b."passengerId"
                     HAVING COUNT(*) >= 5
                   ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),

            // conversion-in-range: всё считаем только по real-users
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c
                     FROM searches s
                LEFT JOIN users u ON u.id = s."userId"
                    WHERE s.created_at BETWEEN :start AND :end
                      AND (s.guest_id IS NOT NULL OR u.registration_source = 'user');`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c
                     FROM bookings b
                     JOIN users u ON u.id = b."passengerId"
                    WHERE u.registration_source = 'user'
                      AND b."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c
                     FROM bookings b
                     JOIN users u ON u.id = b."passengerId"
                    WHERE u.registration_source = 'user'
                      AND b.status = 'CONFIRMED'
                      AND b."createdAt" BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),
            db
               .query<{ c: string }>(
                  `SELECT COUNT(*)::text AS c
                     FROM trips t
                     JOIN users u ON u.id = t.driver_id
                    WHERE u.registration_source = 'user'
                      AND t.status = 'COMPLETED'
                      AND t.updated_at BETWEEN :start AND :end;`,
                  { type: QueryTypes.SELECT, replacements },
               )
               .then((r) => parseInt(r[0]?.c ?? '0', 10)),

            // time-to-first metrics (real only)
            db
               .query<{ v: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM (first_b - signup))/86400)::numeric(10,3)::text AS v
                     FROM (
                        SELECT u."createdAt" AS signup, MIN(b."createdAt") AS first_b
                          FROM users u
                          JOIN bookings b ON b."passengerId" = u.id
                         WHERE u.registration_source = 'user'
                      GROUP BY u.id, u."createdAt"
                     ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT percentile_cont(0.5) WITHIN GROUP (
                          ORDER BY EXTRACT(EPOCH FROM (first_b - signup))/86400
                        )::numeric(10,3)::text AS v
                     FROM (
                        SELECT u."createdAt" AS signup, MIN(b."createdAt") AS first_b
                          FROM users u
                          JOIN bookings b ON b."passengerId" = u.id
                         WHERE u.registration_source = 'user'
                      GROUP BY u.id, u."createdAt"
                     ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT AVG(EXTRACT(EPOCH FROM (first_t - signup))/86400)::numeric(10,3)::text AS v
                     FROM (
                        SELECT u."createdAt" AS signup, MIN(t.created_at) AS first_t
                          FROM users u
                          JOIN trips t ON t.driver_id = u.id
                         WHERE u.registration_source = 'user'
                      GROUP BY u.id, u."createdAt"
                     ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
            db
               .query<{ v: string }>(
                  `SELECT percentile_cont(0.5) WITHIN GROUP (
                          ORDER BY EXTRACT(EPOCH FROM (first_t - signup))/86400
                        )::numeric(10,3)::text AS v
                     FROM (
                        SELECT u."createdAt" AS signup, MIN(t.created_at) AS first_t
                          FROM users u
                          JOIN trips t ON t.driver_id = u.id
                         WHERE u.registration_source = 'user'
                      GROUP BY u.id, u."createdAt"
                     ) x;`,
                  { type: QueryTypes.SELECT },
               )
               .then((r) => parseFloat(r[0]?.v ?? '0')),
         ]);

         return {
            ...wrapRange(range),
            scope: 'real-users-only',

            signups: {
               total: signupsAllTime,
               totalInRange: signupsInRange,
            },

            // Когортная воронка: % людей, зарегавшихся в диапазоне, дошедших до X.
            // signups берётся как знаменатель для всех шагов внутри cohort.
            funnel: {
               cohort: {
                  signups: signupsInRange,
                  withSearch: firstSearchCohort,
                  withBooking: firstBookingCohort,
                  withConfirmedBooking: firstConfirmedCohort,
                  withCompletedTrip: firstCompletedCohort,
                  conversion: {
                     signupToSearch: safeRatio(
                        firstSearchCohort,
                        signupsInRange,
                     ),
                     signupToBooking: safeRatio(
                        firstBookingCohort,
                        signupsInRange,
                     ),
                     signupToConfirmed: safeRatio(
                        firstConfirmedCohort,
                        signupsInRange,
                     ),
                     signupToCompletedTrip: safeRatio(
                        firstCompletedCohort,
                        signupsInRange,
                     ),
                     searchToBooking: safeRatio(
                        firstBookingCohort,
                        firstSearchCohort,
                     ),
                     bookingToConfirmed: safeRatio(
                        firstConfirmedCohort,
                        firstBookingCohort,
                     ),
                  },
               },
               allTime: {
                  signups: signupsAllTime,
                  withSearch: usersWithSearch,
                  withBooking: usersWithBooking,
                  withConfirmedBooking: usersWithConfirmed,
                  withCompletedTrip: usersWithCompleted,
                  conversion: {
                     signupToSearch: safeRatio(usersWithSearch, signupsAllTime),
                     signupToBooking: safeRatio(
                        usersWithBooking,
                        signupsAllTime,
                     ),
                     signupToConfirmed: safeRatio(
                        usersWithConfirmed,
                        signupsAllTime,
                     ),
                     signupToCompletedTrip: safeRatio(
                        usersWithCompleted,
                        signupsAllTime,
                     ),
                     searchToBooking: safeRatio(
                        usersWithBooking,
                        usersWithSearch,
                     ),
                     bookingToConfirmed: safeRatio(
                        usersWithConfirmed,
                        usersWithBooking,
                     ),
                  },
               },
            },

            activity: {
               avgSearchesPerUser: {
                  total: searchesPerUserAllTime,
                  totalInRange: searchesPerUserInRange,
               },
               avgBookingsPerPassenger: {
                  total: bookingsPerPassengerAllTime,
                  totalInRange: bookingsPerPassengerInRange,
               },
               avgTripsPerDriver: {
                  total: tripsPerDriverAllTime,
                  totalInRange: tripsPerDriverInRange,
               },
            },

            drivers: {
               totalReal: realDriversTotal,
               withAnyTrip: driversWithAnyTrip,
               with10PlusTrips: driversWith10Plus,
               activeLast30Days: driversActiveLast30d,
               zeroTripRate: safeRatio(
                  Math.max(realDriversTotal - driversWithAnyTrip, 0),
                  realDriversTotal,
               ),
               activationRate: safeRatio(driversWithAnyTrip, realDriversTotal),
            },

            repeatPassengers: {
               with2PlusConfirmed: passengersWith2PlusConfirmed,
               with5PlusConfirmed: passengersWith5PlusConfirmed,
            },

            conversion: {
               searchToBookingRateInRange: safeRatio(
                  bookingsCountInRange,
                  searchesCountInRange,
               ),
               bookingToConfirmedRateInRange: safeRatio(
                  confirmedBookingsCountInRange,
                  bookingsCountInRange,
               ),
               bookingToCompletedTripRateInRange: safeRatio(
                  completedTripsCountInRange,
                  bookingsCountInRange,
               ),
               // raw counters использовавшиеся выше — для прозрачности
               raw: {
                  searchesInRange: searchesCountInRange,
                  bookingsInRange: bookingsCountInRange,
                  confirmedBookingsInRange: confirmedBookingsCountInRange,
                  completedTripsInRange: completedTripsCountInRange,
               },
            },

            timing: {
               daysFromSignupToFirstBooking: {
                  avg: avgDaysSignupToFirstBooking,
                  median: medianDaysSignupToFirstBooking,
               },
               daysFromSignupToFirstTrip: {
                  avg: avgDaysSignupToFirstTrip,
                  median: medianDaysSignupToFirstTrip,
               },
            },
         };
      },
      300,
   );
};
