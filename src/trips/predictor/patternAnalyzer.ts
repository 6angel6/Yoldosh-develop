import { QueryTypes, Transaction } from 'sequelize';
import db from '../../../shared/config/database';
import { PREDICTION_CONFIG } from '../../../shared/config/prediction';
import logger from '../../../shared/utils/logger';
import DriverPattern from './models/DriverPattern';
import * as driverPatternRepository from './repository/driverPatternRepository';
import { heuristicScore } from './scoring';
import { circularDiffMin, minutesOfDayUZT, uztDateString } from './timeUZT';

export interface PatternInput {
   driverId: string;
   fromCityId?: string | null;
   toCityId?: string | null;
   departureTs: Date;
   carId?: string | null;
   price?: number | null;
   seats?: number | null;
   comment?: string | null;
}

/**
 * Считает скользящее окно регулярности: число РАЗНЫХ дней публикации (UZT, по
 * created_at) за WINDOW_DAYS, когда водитель создавал реальный трип на этом
 * маршруте. Время выезда по умолчанию НЕ учитывается (главное — маршрут); при
 * MATCH_BY_TIME=true дополнительно требуется попадание в ±TIME_TOLERANCE_MIN от
 * времени текущего трипа. Строк на водителя/маршрут за неделю — единицы.
 */
const countWindowOccurrences = async (
   input: PatternInput,
   departureMin: number,
   transaction: Transaction,
): Promise<number> => {
   const since = new Date(
      Date.now() - PREDICTION_CONFIG.WINDOW_DAYS * 24 * 60 * 60 * 1000,
   );

   const rows = (await db.query(
      `SELECT departure_ts, created_at
         FROM trips
        WHERE driver_id = :driverId
          AND from_city_id = :fromCityId
          AND to_city_id = :toCityId
          AND is_predicted = false
          AND deleted_at IS NULL
          AND created_at >= :since`,
      {
         replacements: {
            driverId: input.driverId,
            fromCityId: input.fromCityId,
            toCityId: input.toCityId,
            since,
         },
         type: QueryTypes.SELECT,
         transaction,
      },
   )) as Array<{ departure_ts: Date; created_at: Date }>;

   const days = new Set<string>();
   for (const row of rows) {
      if (PREDICTION_CONFIG.MATCH_BY_TIME) {
         const min = minutesOfDayUZT(new Date(row.departure_ts));
         if (
            circularDiffMin(min, departureMin) >
            PREDICTION_CONFIG.TIME_TOLERANCE_MIN
         ) {
            continue;
         }
      }
      days.add(uztDateString(new Date(row.created_at)));
   }
   return days.size;
};

/**
 * Upsert паттерна по реальному трипу: обновляет медиану времени, окно 3/7,
 * confidence и статус (candidate|active). Вызывается в транзакции импорта после
 * сохранения реального трипа. Возвращает паттерн (или null, если построить
 * нельзя — фича выключена / нет city_id).
 */
export const updatePattern = async (
   input: PatternInput,
   transaction: Transaction,
): Promise<DriverPattern | null> => {
   if (!PREDICTION_CONFIG.ENABLED) return null;
   if (!input.fromCityId || !input.toCityId) return null;

   const fromCityId = input.fromCityId;
   const toCityId = input.toCityId;
   const departureMin = minutesOfDayUZT(input.departureTs);
   const tolerance = PREDICTION_CONFIG.TIME_TOLERANCE_MIN;
   const matchByTime = PREDICTION_CONFIG.MATCH_BY_TIME;
   const today = uztDateString(new Date());
   const cap = PREDICTION_CONFIG.RECENT_TIMES_CAP;

   const windowOcc = await countWindowOccurrences(
      input,
      departureMin,
      transaction,
   );

   // Один паттерн на маршрут (время в ключ не входит).
   let pattern = await driverPatternRepository.findMatchingPattern(
      { driverId: input.driverId, fromCityId, toCityId },
      transaction,
   );

   if (!pattern) {
      const recent = [departureMin];
      const confidence = heuristicScore({
         windowOccurrences: windowOcc,
         daysSinceLastSeen: 0,
         recentDepartureMin: recent,
         matchByTime,
      });
      const status =
         windowOcc >= PREDICTION_CONFIG.MIN_OCCURRENCES &&
         confidence >= PREDICTION_CONFIG.CONFIDENCE_THRESHOLD
            ? 'active'
            : 'candidate';

      pattern = await driverPatternRepository.createPattern(
         {
            driver_id: input.driverId,
            from_city_id: fromCityId,
            to_city_id: toCityId,
            departure_time: departureMin,
            time_tolerance: tolerance,
            recent_departure_min: recent,
            price: input.price ?? null,
            seats: input.seats ?? null,
            car_id: input.carId ?? null,
            comment: input.comment ?? null,
            occurrences: 1,
            window_occurrences: windowOcc,
            first_seen: today,
            last_seen: today,
            confidence,
            status,
         },
         transaction,
      );

      logger.info(
         {
            patternId: pattern.id,
            driverId: input.driverId,
            windowOcc,
            confidence,
            status,
         },
         'Predictor: pattern created',
      );
      return pattern;
   }

   const recent = [...pattern.recent_departure_min, departureMin].slice(-cap);
   pattern.recent_departure_min = recent;
   // Время прогноза = время из последнего объявления (как прислал парсер), а не
   // медиана — чтобы «двугорбый» водитель (утро/вечер) получал прогноз на своё
   // фактическое последнее время, а не на усреднённую середину.
   pattern.departure_time = departureMin;
   pattern.occurrences += 1;
   pattern.window_occurrences = windowOcc;
   pattern.last_seen = today;
   if (input.price != null) pattern.price = input.price;
   if (input.seats != null) pattern.seats = input.seats;
   if (input.carId != null) pattern.car_id = input.carId;
   if (input.comment != null) pattern.comment = input.comment;

   const confidence = heuristicScore({
      windowOccurrences: windowOcc,
      daysSinceLastSeen: 0,
      recentDepartureMin: recent,
      matchByTime,
   });
   pattern.confidence = confidence;

   // MVP: статусы candidate|active (decay/реактивация — [Этап 2])
   pattern.status =
      windowOcc >= PREDICTION_CONFIG.MIN_OCCURRENCES &&
      confidence >= PREDICTION_CONFIG.CONFIDENCE_THRESHOLD
         ? 'active'
         : pattern.status === 'active'
           ? 'active'
           : 'candidate';

   await driverPatternRepository.savePattern(pattern, transaction);

   logger.info(
      {
         patternId: pattern.id,
         windowOcc,
         confidence,
         status: pattern.status,
      },
      'Predictor: pattern updated',
   );
   return pattern;
};
