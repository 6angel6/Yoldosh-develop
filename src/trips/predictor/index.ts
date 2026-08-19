/**
 * Trip Predictor — публичный фасад модуля (Этап 1 / MVP).
 *
 * Контракт (ср. ТЗ §8), адаптированный под транзакции проекта:
 *   - findMatchingPrediction — найти прогноз того же дня/маршрута (в транзакции приёма, ДО дедупа)
 *   - promotePrediction      — «повысить» прогноз на месте: тот же трип теряет метку, id сохраняется
 *   - updatePattern          — upsert паттерна + окно 3/7 + confidence (после сохранения реального трипа)
 *   - generatePredictions    — досоздание прогнозов на горизонт (после commit / cron)
 *   - process                — updatePattern→generate для НЕ-импортных call-site'ов
 *   - runDaily               — ежедневный cron: долив горизонта + expire протухших
 *   - runExpireSweep         — ежечасный cron: снятие неподтверждённых прогнозов с бронями
 *   - deactivatePattern      — ручное отключение (админка)
 *
 * Подтверждение прогноза реальной публикацией = «повышение на месте» (Вариант 1):
 * прогнозный трип НЕ пересоздаётся, а теряет метку is_predicted — тот же id, поэтому
 * брони/чаты на нём остаются сами, перепривязка не нужна.
 */
import { Transaction } from 'sequelize';
import Trip from '../models/Trip';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { PREDICTION_CONFIG } from '../../../shared/config/prediction';
import logger from '../../../shared/utils/logger';
import { findMatchingPrediction, promotePrediction } from './reconciler';
import { updatePattern } from './patternAnalyzer';
import { generatePredictions } from './predictionEngine';
import { runDaily, runExpireSweep, deactivatePattern } from './maintenance';

/**
 * Полный цикл предиктора для одного реального трипа (по id). Для НЕ-импортных
 * вызовов (пользовательский createTrip): открывает свою транзакцию, обновляет
 * паттерн и досоздаёт прогнозы. «Повышение» прогнозов здесь не делается — оно
 * встроено в пайплайн импорта до создания трипа (см. tripImportService).
 */
const process = async (tripId: string): Promise<void> => {
   if (!PREDICTION_CONFIG.ENABLED) return;

   const trip = await Trip.findByPk(tripId);
   if (!trip || trip.is_predicted) return; // прогнозы в предиктор не возвращаем

   let patternId: string | null = null;
   let patternActive = false;

   await withDeadlockRetry(async (t: Transaction) => {
      const pattern = await updatePattern(
         {
            driverId: trip.driver_id,
            fromCityId: trip.from_city_id,
            toCityId: trip.to_city_id,
            departureTs: new Date(trip.departure_ts),
            carId: trip.car_id,
            price: Number(trip.price_per_person),
            seats: trip.seats_available,
            comment: trip.comment ?? null,
         },
         t,
      );
      if (pattern) {
         patternId = pattern.id;
         patternActive = pattern.status === 'active';
      }
   });

   if (patternActive && patternId) {
      generatePredictions(patternId).catch((err) =>
         logger.error({ err, patternId }, 'Predictor: generation failed'),
      );
   }
};

export const predictor = {
   findMatchingPrediction,
   promotePrediction,
   updatePattern,
   generatePredictions,
   process,
   runDaily,
   runExpireSweep,
   deactivatePattern,
};

export default predictor;
