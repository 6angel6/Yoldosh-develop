import { Op, Transaction } from 'sequelize';
import Trip, { TripStatus } from '../models/Trip';
import Booking, { BookingStatus } from '../../booking/models/Booking';
import * as bookingRepository from '../../booking/repository/bookingRepository';
import * as promocodeRepository from '../../promocode/repository/promocodeRepository';
import * as userRepository from '../../user/repository/userRepository';
import { publishTripNotification } from '../../workers/queues/notificationQueue';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { PREDICTION_CONFIG } from '../../../shared/config/prediction';
import logger from '../../../shared/utils/logger';
import * as driverPatternRepository from './repository/driverPatternRepository';
import * as predictionLogRepository from './repository/predictionLogRepository';
import { generatePredictions } from './predictionEngine';

/** Брони, которые ещё «живые» и должны быть отменены вместе с прогнозом. */
const LIVE_BOOKING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/** Пассажир, которого нужно уведомить ПОСЛЕ commit (см. cancelTrip). */
interface AffectedPassenger {
   passengerId: string;
   tripId: string;
   driverId: string;
   fromCity: string;
   toCity: string;
}

/**
 * Снимает прогнозный трип, который водитель так и не подтвердил.
 *
 * Прогноз — фантом: реального рейса не будет, поэтому трип soft-delete'ится
 * (иначе он занял бы день в uq_trips_predicted_day и заблокировал новый прогноз).
 * Но если пассажир успел забронировать, молча удалять нельзя: бронь повисла бы
 * навсегда, указывая на удалённый трип. Поэтому брони проходят тот же путь, что
 * и при отмене рейса водителем (см. tripLifecycleService.cancelTrip): отмена с
 * причиной, возврат промокода, уведомление пассажира после commit.
 *
 * Возвращает пассажиров для уведомления — рассылка снаружи транзакции, чтобы
 * повтор withDeadlockRetry не отправил пуш дважды.
 */
const retirePrediction = async (
   trip: Trip,
   outcome: 'expired' | 'cancelled',
   reason: string,
): Promise<AffectedPassenger[]> => {
   return withDeadlockRetry(async (t: Transaction) => {
      const bookings = await Booking.findAll({
         where: {
            tripId: trip.id,
            status: { [Op.in]: LIVE_BOOKING_STATUSES },
         },
         transaction: t,
      });

      const affected: AffectedPassenger[] = [];

      for (const booking of bookings) {
         // Промокод списывается только при подтверждении брони водителем —
         // возвращаем его лишь тем, у кого бронь дошла до CONFIRMED.
         if (booking.status === BookingStatus.CONFIRMED) {
            await restorePromoCode(booking.passengerId, t);
         }

         await bookingRepository.cancelBookingWithReason(booking.id, reason, t);

         affected.push({
            passengerId: booking.passengerId,
            tripId: trip.id,
            driverId: trip.driver_id,
            fromCity: booking.from_city,
            toCity: booking.to_city,
         });
      }

      await Trip.destroy({ where: { id: trip.id }, transaction: t });

      if (outcome === 'expired') {
         await predictionLogRepository.markExpired([trip.id], t);
      } else {
         await predictionLogRepository.markCancelled([trip.id], t);
      }

      if (affected.length > 0) {
         logger.info(
            { tripId: trip.id, bookings: affected.length, outcome },
            'Predictor: retired prediction with live bookings',
         );
      }
      return affected;
   });
};

/** Возврат промокода пассажиру (зеркало логики cancelTrip). */
const restorePromoCode = async (
   passengerId: string,
   t: Transaction,
): Promise<void> => {
   const userPromoCode = await promocodeRepository.findByUserId(passengerId, t);
   if (!userPromoCode || userPromoCode.isActive) return;

   userPromoCode.isActive = true;
   await promocodeRepository.save(userPromoCode, t);

   const user = await userRepository.findUserById(passengerId, t);
   if (user) {
      user.isHavePromocode = true;
      await user.save({ transaction: t });
   }
};

/** Пуш пассажиру: рейс, который он забронировал, не состоится. */
const notifyPassengers = async (
   passengers: AffectedPassenger[],
): Promise<void> => {
   await Promise.all(
      passengers.map((p) =>
         publishTripNotification({
            recipientId: p.passengerId,
            eventType: 'end_trip',
            metadata: {
               tripId: p.tripId,
               status: TripStatus.Canceled,
               driverId: p.driverId,
               passengerId: p.passengerId,
            },
            translation: {
               key: 'notification.trip.cancelled.passenger',
               params: { fromCity: p.fromCity, toCity: p.toCity },
               titleKey: 'title.trip.cancelled',
            },
         }).catch((err) =>
            logger.error(
               { err, tripId: p.tripId, passengerId: p.passengerId },
               'Predictor: failed to notify passenger about retired prediction',
            ),
         ),
      ),
   );
};

/**
 * Снимает прогнозы, которые водитель так и не подтвердил к моменту выезда.
 *
 * Держим прогноз до последнего — пока не наступит departure_ts. Водитель
 * публикует объявление в день поездки, нередко перед самым выездом: любая
 * ранняя отмена убила бы бронь, которая вот-вот стала бы реальной. До выезда
 * пассажир видит бронь как ожидающую подтверждения, деньги не списаны.
 *
 * Идёт по одному трипу в своей транзакции: сбой на одном не роняет остальные.
 */
export const expireDuePredictions = async (): Promise<number> => {
   const candidates = await Trip.findAll({
      where: {
         is_predicted: true,
         status: TripStatus.Created,
         departure_ts: { [Op.lt]: new Date() },
      },
   });
   if (candidates.length === 0) return 0;

   const reason = 'Driver did not confirm this trip.';
   let retired = 0;

   for (const trip of candidates) {
      try {
         const passengers = await retirePrediction(trip, 'expired', reason);
         retired++;
         await notifyPassengers(passengers);
      } catch (err) {
         logger.error(
            { err, tripId: trip.id },
            'Predictor: failed to retire prediction',
         );
      }
   }
   return retired;
};

/**
 * Ежедневный cron (03:00): долив горизонта активных паттернов + снятие
 * протухших прогнозов. [Этап 2]: decay/inactive/реактивация.
 */
export const runDaily = async (): Promise<void> => {
   if (!PREDICTION_CONFIG.ENABLED) {
      logger.info('Predictor disabled — skipping runDaily');
      return;
   }

   const active = await driverPatternRepository.findActivePatterns();
   let generated = 0;
   for (const pattern of active) {
      try {
         generated += await generatePredictions(pattern.id);
      } catch (err) {
         logger.error(
            { err, patternId: pattern.id },
            'Predictor: runDaily generation failed for pattern',
         );
      }
   }

   const expired = await expireDuePredictions();

   logger.info(
      { activePatterns: active.length, generated, expired },
      'Predictor: runDaily completed',
   );
};

/**
 * Ежечасный cron: снимает неподтверждённые прогнозы, время выезда которых уже
 * прошло. Отдельно от runDaily, потому что суточного прохода не хватает: бронь
 * на рейс, уехавший в 18:00, висела бы «в ожидании» до 03:00 следующих суток.
 */
export const runExpireSweep = async (): Promise<void> => {
   if (!PREDICTION_CONFIG.ENABLED) return;

   const retired = await expireDuePredictions();
   if (retired > 0) {
      logger.info({ retired }, 'Predictor: expire sweep completed');
   }
};

/**
 * Ручное отключение паттерна (жалоба/бан водителя) — дергается из админки.
 * Ставит статус inactive и снимает все будущие прогнозы этого паттерна,
 * отменяя брони и уведомляя пассажиров.
 */
export const deactivatePattern = async (patternId: string): Promise<void> => {
   await withDeadlockRetry(async (t) => {
      const pattern = await driverPatternRepository.findById(patternId, t);
      if (!pattern) return;

      pattern.status = 'inactive';
      await driverPatternRepository.savePattern(pattern, t);
   });

   const future = await Trip.findAll({
      where: {
         pattern_id: patternId,
         is_predicted: true,
         status: TripStatus.Created,
      },
   });

   const reason = 'Trip cancelled by driver.';
   for (const trip of future) {
      try {
         const passengers = await retirePrediction(trip, 'cancelled', reason);
         await notifyPassengers(passengers);
      } catch (err) {
         logger.error(
            { err, tripId: trip.id, patternId },
            'Predictor: failed to retire prediction on deactivation',
         );
      }
   }

   logger.info(
      { patternId, retired: future.length },
      'Predictor: pattern deactivated',
   );
};
