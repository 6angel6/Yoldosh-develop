import { Trip } from '../models/Trip';
import * as tripRepository from '../repository/tripRepository';
import { formatTripResponse } from './tripFormatterService';
import { getOrSetCache } from '../../../shared/config/redis';
import { getCurrentTimeUTC } from '../../../shared/utils/timeUtils';

export const getUserActivity = async (
   userId: string,
   role: 'driver' | 'passenger',
   page: number,
   limit: number,
) => {
   const cacheKey = `user:activity:${userId}:${role}:${page}:${limit}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const offset = (page - 1) * limit;

         const { count, rows } = await tripRepository.findUserActivity({
            userId,
            role,
            limit,
            offset,
         });

         const structuredTrips = rows.map((trip: Trip) =>
            formatTripResponse(trip, null),
         );

         return {
            trips: structuredTrips,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
         };
      },
      300, // TTL: 5 минут (активность пользователя может меняться)
   );
};

export const getTripDetailsPublic = async (tripId: string) => {
   const trip = await tripRepository.findTripByIdPublicDetails(tripId);

   if (!trip) return null;

   return formatTripResponse(trip, null);
};

export const getPopularTrips = async (page: number = 1, limit: number = 10) => {
   // Лента «популярных» (свежих CREATED) поездок одинакова для всех пользователей
   // (formatTripResponse без promo/user-слоя), поэтому кэшируем готовый ответ.
   // Ключ в namespace trip:search:* — его уже инвалидируют все clearCache('trip:search:*')
   // при создании/изменении/отмене поездки и изменении броней, так что отдельная
   // инвалидация не нужна, а лента не «залипает».
   const cacheKey = `trip:search:popular:${page}:${limit}`;

   const cached = await getOrSetCache(
      cacheKey,
      async () => {
         const offset = (page - 1) * limit;

         const { count, rows } = await tripRepository.findPopularTripsWithCount(
            limit,
            offset,
         );

         const formatted = rows.map((trip) => formatTripResponse(trip, null));

         return {
            trips: formatted,
            total: count,
            totalPages: Math.ceil(count / limit),
            page,
         };
      },
      300, // TTL: 5 минут (как у trip:search); чаще обновляется через инвалидацию
   );

   // Защита от кэш-окна: трип мог отъехать, пока ответ лежал в кэше (TTL до 5 мин) —
   // отсекаем протухшие на выдаче, чтобы из кэша они тоже не приходили. На cache-miss
   // их уже нет (departure_ts >= now в where выше).
   const nowMs = getCurrentTimeUTC().getTime();
   return {
      ...cached,
      trips: cached.trips.filter(
         (t: any) => new Date(t.departure_ts).getTime() >= nowMs,
      ),
   };
};
