import { Op, Transaction } from 'sequelize';
import PredictionLog, {
   PredictionLogCreationAttributes,
} from '../models/PredictionLog';

export const createLog = async (
   data: PredictionLogCreationAttributes,
   transaction?: Transaction,
): Promise<PredictionLog> => {
   return PredictionLog.create(data, { transaction });
};

/**
 * Помечает прогноз подтверждённым (reconcile): pending → confirmed.
 * Находит по predicted_trip; ставит confirmed_trip и resolved_at.
 */
export const markConfirmed = async (
   predictedTripId: string,
   confirmedTripId: string,
   transaction?: Transaction,
): Promise<number> => {
   const [count] = await PredictionLog.update(
      {
         outcome: 'confirmed',
         confirmed_trip: confirmedTripId,
         resolved_at: new Date(),
      },
      {
         where: { predicted_trip: predictedTripId, outcome: 'pending' },
         transaction,
      },
   );
   return count;
};

/** Помечает прогнозы протухшими (cron): pending → expired. */
export const markExpired = async (
   predictedTripIds: string[],
   transaction?: Transaction,
): Promise<number> => {
   if (predictedTripIds.length === 0) return 0;
   const [count] = await PredictionLog.update(
      { outcome: 'expired', resolved_at: new Date() },
      {
         where: {
            predicted_trip: { [Op.in]: predictedTripIds },
            outcome: 'pending',
         },
         transaction,
      },
   );
   return count;
};

/** [Этап 2] отмена прогнозов при decay: pending → cancelled. */
export const markCancelled = async (
   predictedTripIds: string[],
   transaction?: Transaction,
): Promise<number> => {
   if (predictedTripIds.length === 0) return 0;
   const [count] = await PredictionLog.update(
      { outcome: 'cancelled', resolved_at: new Date() },
      {
         where: {
            predicted_trip: { [Op.in]: predictedTripIds },
            outcome: 'pending',
         },
         transaction,
      },
   );
   return count;
};
