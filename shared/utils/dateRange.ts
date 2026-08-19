/**
 * Унифицированные пресеты диапазонов дат для админских списков и статистик.
 *
 * Используется в:
 *  - admin/bookings, admin/trips, admin/users (списки с фильтром)
 *  - admin/statistics (для resolveRange)
 *  - super-admin страницах (active-trips, finished-trips, wallets, reports, bookings)
 *
 * Пресеты:
 *  today / yesterday / week / month / quarter / year / custom (from+to)
 */

export interface DateRangeInput {
   range?: string;
   from?: string | Date;
   to?: string | Date;
   /** legacy params */
   startDate?: string | Date;
   endDate?: string | Date;
}

export interface ResolvedDateRange {
   /** Начало диапазона (включительно). */
   start: Date;
   /** Конец диапазона (включительно). */
   end: Date;
   /** Канонический ключ диапазона ('today' | 'custom_<iso>_<iso>' | ...). */
   key: string;
   /** Сколько шагов укладывается в ось X для графиков. */
   buckets: number;
   /** Тип шага для date_trunc Postgres. */
   bucketUnit: 'hour' | 'day' | 'week' | 'month';
}

const startOfDay = (d: Date) => {
   const x = new Date(d);
   x.setHours(0, 0, 0, 0);
   return x;
};
const endOfDay = (d: Date) => {
   const x = new Date(d);
   x.setHours(23, 59, 59, 999);
   return x;
};

const pickBucket = (diffDays: number): ResolvedDateRange['bucketUnit'] =>
   diffDays <= 2
      ? 'hour'
      : diffDays <= 60
        ? 'day'
        : diffDays <= 365
          ? 'week'
          : 'month';

/**
 * Резолвит человекочитаемый пресет в конкретные start/end + параметры графиков.
 *
 * Если диапазон не распознан (включая отсутствие параметров), возвращает 'month'.
 */
export const resolveDateRange = (
   input: DateRangeInput = {},
): ResolvedDateRange => {
   const now = new Date();
   const raw = (input.range || '').toString().trim().toLowerCase() || 'month';

   // Поддержка legacy startDate/endDate — мапим в custom.
   const fromRaw = input.from ?? input.startDate;
   const toRaw = input.to ?? input.endDate;

   if ((raw === 'custom' || (fromRaw && toRaw)) && fromRaw && toRaw) {
      const start = startOfDay(new Date(fromRaw));
      const end = endOfDay(new Date(toRaw));
      const diffDays = Math.max(
         1,
         Math.round((end.getTime() - start.getTime()) / 86_400_000),
      );
      return {
         start,
         end,
         buckets: diffDays,
         bucketUnit: pickBucket(diffDays),
         key: `custom_${start.toISOString()}_${end.toISOString()}`,
      };
   }

   if (raw === 'today' || raw === 'day') {
      return {
         start: startOfDay(now),
         end: endOfDay(now),
         buckets: 24,
         bucketUnit: 'hour',
         key: 'today',
      };
   }

   if (raw === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return {
         start: startOfDay(y),
         end: endOfDay(y),
         buckets: 24,
         bucketUnit: 'hour',
         key: 'yesterday',
      };
   }

   if (raw === 'week') {
      const start = startOfDay(now);
      start.setDate(now.getDate() - 6);
      return {
         start,
         end: endOfDay(now),
         buckets: 7,
         bucketUnit: 'day',
         key: 'week',
      };
   }

   if (raw === 'quarter') {
      const start = startOfDay(now);
      start.setDate(now.getDate() - 89);
      return {
         start,
         end: endOfDay(now),
         buckets: 13,
         bucketUnit: 'week',
         key: 'quarter',
      };
   }

   if (raw === 'year') {
      const start = startOfDay(now);
      start.setMonth(now.getMonth() - 11);
      start.setDate(1);
      return {
         start,
         end: endOfDay(now),
         buckets: 12,
         bucketUnit: 'month',
         key: 'year',
      };
   }

   // month (default)
   const start = startOfDay(now);
   start.setDate(now.getDate() - 29);
   return {
      start,
      end: endOfDay(now),
      buckets: 30,
      bucketUnit: 'day',
      key: 'month',
   };
};

/**
 * Возвращает [start, end] если в input есть какой-либо hint о диапазоне,
 * иначе null (значит — фильтра по дате не нужно).
 *
 * Используется в репозиториях, чтобы условно подмешивать
 * { [Op.between]: [start, end] } в whereClause.
 */
export const getDateRangeBounds = (
   input: DateRangeInput = {},
): { start: Date; end: Date; key: string } | null => {
   const hasAnyHint =
      input.range || input.from || input.to || input.startDate || input.endDate;
   if (!hasAnyHint) return null;
   const r = resolveDateRange(input);
   return { start: r.start, end: r.end, key: r.key };
};
