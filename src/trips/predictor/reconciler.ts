import { Op, Transaction } from 'sequelize';
import Trip, { TripStatus, TripAttributes } from '../models/Trip';
import Booking, { BookingStatus } from '../../booking/models/Booking';
import { PREDICTION_CONFIG } from '../../../shared/config/prediction';
import logger from '../../../shared/utils/logger';
import * as predictionLogRepository from './repository/predictionLogRepository';
import { circularDiffMin, minutesOfDayUZT, uztDayRangeUTC } from './timeUZT';

export interface MatchKey {
   driverId: string;
   fromCityId?: string | null;
   toCityId?: string | null;
   departureTs: Date;
}

/**
 * Reconciliation (Вариант «повысить на месте»): реальный трип подтверждает
 * прогноз — тот же трип теряет метку прогноза, а НЕ пересоздаётся. Id остаётся,
 * поэтому брони/чаты, если пассажир успел забронировать прогноз, остаются на
 * месте сами (переносить ничего не нужно).
 *
 * Ищет активный прогнозный трип того же водителя/маршрута на тот же UZT-день с
 * временем в пределах допуска. Блокирует строку (FOR UPDATE), чтобы параллельный
 * импорт не «повысил» её дважды. Вызывается в транзакции приёма ДО дедупа; если
 * нашли — импорт пропускает создание нового трипа и «повышает» этот.
 */
export const findMatchingPrediction = async (
   key: MatchKey,
   transaction: Transaction,
): Promise<Trip | null> => {
   if (!PREDICTION_CONFIG.ENABLED) return null;
   if (!key.fromCityId || !key.toCityId) return null;

   const { start, end } = uztDayRangeUTC(key.departureTs);
   const departureMin = minutesOfDayUZT(key.departureTs);

   const predicted = await Trip.findOne({
      where: {
         driver_id: key.driverId,
         from_city_id: key.fromCityId,
         to_city_id: key.toCityId,
         is_predicted: true,
         status: TripStatus.Created,
         departure_ts: { [Op.gte]: start, [Op.lt]: end },
      },
      lock: Transaction.LOCK.UPDATE,
      transaction,
   });

   if (!predicted) return null;

   // Время опционально: прогноз того же маршрута на тот же день подтверждается
   // реальным трипом независимо от времени. В строгом режиме — доп. проверка ±допуск.
   if (PREDICTION_CONFIG.MATCH_BY_TIME) {
      const min = minutesOfDayUZT(new Date(predicted.departure_ts));
      if (
         circularDiffMin(min, departureMin) >
         PREDICTION_CONFIG.TIME_TOLERANCE_MIN
      ) {
         return null;
      }
   }
   return predicted;
};

/**
 * «Повышает» прогнозный трип до реального НА МЕСТЕ: снимает метку, чистит
 * прогнозные поля и перезаписывает актуальными данными из объявления (цена,
 * места, машина, время, флаги). Тот же id. Отмечает прогноз сбывшимся в
 * prediction_log (confirmed_trip = тот же трип).
 *
 * seats_available — счётчик СВОБОДНЫХ мест: подтверждённые брони его уже
 * уменьшили. Объявление присылает ОБЩЕЕ число мест, поэтому вычитаем занятые,
 * иначе повышение вернуло бы места в продажу и трип был бы перепродан.
 */
export const promotePrediction = async (
   predicted: Trip,
   data: Partial<TripAttributes>,
   transaction: Transaction,
): Promise<Trip> => {
   const next: Partial<TripAttributes> = { ...data };

   if (next.seats_available != null) {
      const bookedSeats = Number(
         (await Booking.sum('seatsBooked', {
            where: {
               tripId: predicted.id,
               status: BookingStatus.CONFIRMED,
            },
            transaction,
         })) ?? 0,
      );
      if (bookedSeats > 0) {
         next.seats_available = Math.max(
            0,
            Number(next.seats_available) - bookedSeats,
         );
      }
   }

   predicted.set(next);
   predicted.is_predicted = false;
   predicted.source_trip_id = null;
   predicted.prediction_confidence = null;
   predicted.predicted_at = null;
   // pattern_id оставляем — не мешает и полезен для аналитики «был спрогнозирован».
   await predicted.save({ transaction });

   await predictionLogRepository.markConfirmed(
      predicted.id,
      predicted.id,
      transaction,
   );

   logger.info(
      { tripId: predicted.id, driverId: predicted.driver_id },
      'Predictor: prediction promoted in place to a real trip',
   );
   return predicted;
};
