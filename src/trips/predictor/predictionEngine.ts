import { Op } from 'sequelize';
import Trip, { TripStatus } from '../models/Trip';
import * as tripRepository from '../repository/tripRepository';
import { CreateTripData } from '../repository/tripRepository';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { clearCache } from '../../../shared/config/redis';
import { PREDICTION_CONFIG } from '../../../shared/config/prediction';
import logger from '../../../shared/utils/logger';
import DriverPattern from './models/DriverPattern';
import * as driverPatternRepository from './repository/driverPatternRepository';
import * as predictionLogRepository from './repository/predictionLogRepository';
import {
   addDays,
   circularDiffMin,
   minutesOfDayUZT,
   uztDateString,
   uztDayRangeUTC,
} from './timeUZT';

/** Последний реальный трип водителя на маршруте паттерна — шаблон для копий. */
const findLatestRealTrip = async (
   pattern: DriverPattern,
): Promise<Trip | null> => {
   return Trip.findOne({
      where: {
         driver_id: pattern.driver_id,
         from_city_id: pattern.from_city_id,
         to_city_id: pattern.to_city_id,
         is_predicted: false,
      },
      order: [['createdAt', 'DESC']],
   });
};

/**
 * Дни (UZT, YYYY-MM-DD) в горизонте, где у водителя уже есть активный
 * реальный ИЛИ прогнозный трип на этом маршруте в пределах допуска времени.
 * paranoid-модель сама исключает soft-deleted.
 */
const loadOccupiedDays = async (
   pattern: DriverPattern,
   now: Date,
): Promise<Set<string>> => {
   const horizonStart = uztDayRangeUTC(addDays(now, 1)).start;
   const horizonEnd = uztDayRangeUTC(
      addDays(now, PREDICTION_CONFIG.HORIZON_DAYS),
   ).end;

   const rows = await Trip.findAll({
      attributes: ['departure_ts'],
      where: {
         driver_id: pattern.driver_id,
         from_city_id: pattern.from_city_id,
         to_city_id: pattern.to_city_id,
         status: { [Op.in]: [TripStatus.Created, TripStatus.InProgress] },
         departure_ts: { [Op.between]: [horizonStart, horizonEnd] },
      },
   });

   const occupied = new Set<string>();
   for (const row of rows) {
      if (PREDICTION_CONFIG.MATCH_BY_TIME) {
         const min = minutesOfDayUZT(new Date(row.departure_ts));
         if (
            circularDiffMin(min, pattern.departure_time) >
            pattern.time_tolerance
         ) {
            continue;
         }
      }
      occupied.add(uztDateString(new Date(row.departure_ts)));
   }
   return occupied;
};

const buildPredictedTrip = (
   pattern: DriverPattern,
   source: Trip,
   departureUTC: Date,
   confidence: number,
   now: Date,
): CreateTripData => {
   const duration = source.duration ?? undefined;
   const arrivalUTC = duration
      ? new Date(departureUTC.getTime() + duration * 60 * 1000)
      : undefined;

   return {
      driver_id: pattern.driver_id,
      car_id: source.car_id,

      from_city: source.from_city,
      to_city: source.to_city,
      from_city_id: pattern.from_city_id,
      to_city_id: pattern.to_city_id,

      from_latitude: Number(source.from_latitude),
      from_longitude: Number(source.from_longitude),
      to_latitude: Number(source.to_latitude),
      to_longitude: Number(source.to_longitude),

      from_address: source.from_address,
      to_address: source.to_address,

      departure_ts: departureUTC,
      arrival_ts: arrivalUTC,
      distance: source.distance ?? undefined,
      duration,

      booking_type: source.booking_type,
      seats_available: pattern.seats ?? source.seats_available,
      price_per_person: pattern.price ?? Number(source.price_per_person),
      max_two_back: source.max_two_back,

      conditioner: source.conditioner,
      smoking_allowed: source.smoking_allowed,
      door_pickup: source.door_pickup,
      food_stop: source.food_stop,
      garage: source.garage,

      comment: source.comment ?? '',
      status: TripStatus.Created,

      is_predicted: true,
      source_trip_id: source.id,
      pattern_id: pattern.id,
      prediction_confidence: confidence,
      predicted_at: now,
   };
};

const isUniqueViolation = (err: unknown): boolean =>
   !!err &&
   typeof err === 'object' &&
   (err as { name?: string }).name === 'SequelizeUniqueConstraintError';

/**
 * Досоздаёт прогнозные трипы активного паттерна на горизонт HORIZON_DAYS,
 * начиная с завтрашнего UZT-дня. Идемпотентно: пропускает дни, где уже есть
 * реальный/прогнозный трип (+ бэкстоп-уникальный индекс uq_trips_predicted_day).
 * Каждый прогноз создаётся в собственной короткой транзакции — сбой на одном
 * дне (например, гонка с другой генерацией) не откатывает остальные.
 *
 * Возвращает число созданных прогнозов. Вызывается после commit импорта и из
 * ежедневного cron.
 */
export const generatePredictions = async (
   patternId: string,
): Promise<number> => {
   if (!PREDICTION_CONFIG.ENABLED) return 0;

   const pattern = await driverPatternRepository.findById(patternId);
   if (!pattern || pattern.status !== 'active') return 0;

   const source = await findLatestRealTrip(pattern);
   if (!source) {
      logger.warn(
         { patternId },
         'Predictor: no source trip for active pattern, skip generation',
      );
      return 0;
   }

   const now = new Date();
   const confidence = Number(pattern.confidence);
   const occupied = await loadOccupiedDays(pattern, now);

   let created = 0;
   for (let n = 1; n <= PREDICTION_CONFIG.HORIZON_DAYS; n++) {
      const targetDate = addDays(now, n);
      const dayStr = uztDateString(targetDate);
      if (occupied.has(dayStr)) continue;

      const { start } = uztDayRangeUTC(targetDate);
      const departureUTC = new Date(
         start.getTime() + pattern.departure_time * 60 * 1000,
      );
      if (departureUTC.getTime() <= now.getTime()) continue;

      try {
         await withDeadlockRetry(async (t) => {
            const predicted = await tripRepository.createTrip(
               buildPredictedTrip(
                  pattern,
                  source,
                  departureUTC,
                  confidence,
                  now,
               ),
               t,
            );
            await predictionLogRepository.createLog(
               {
                  pattern_id: pattern.id,
                  predicted_trip: predicted.id,
                  target_date: dayStr,
               },
               t,
            );
         });
         occupied.add(dayStr);
         created++;
      } catch (err) {
         if (isUniqueViolation(err)) {
            logger.info(
               { patternId, dayStr },
               'Predictor: prediction for day already exists, skipping',
            );
            continue;
         }
         logger.error(
            { err, patternId, dayStr },
            'Predictor: failed to create prediction',
         );
      }
   }

   if (created > 0) {
      clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Cache invalidation failed'),
      );
      logger.info(
         { patternId, created, horizon: PREDICTION_CONFIG.HORIZON_DAYS },
         'Predictor: predictions generated',
      );
   }
   return created;
};
