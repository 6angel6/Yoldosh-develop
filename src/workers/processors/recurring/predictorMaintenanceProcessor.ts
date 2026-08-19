import { predictor } from '../../../trips/predictor';

/**
 * Ежедневное обслуживание Trip Predictor (cron 03:00):
 * долив горизонта прогнозов активных паттернов + удаление протухших прогнозов.
 */
export const runPredictorMaintenance = async (): Promise<void> => {
   await predictor.runDaily();
};

/**
 * Ежечасный проход (cron :05): снимает прогнозы, которые водитель не подтвердил
 * к моменту выезда, отменяя брони на них и уведомляя пассажиров. Суточного
 * прохода мало — бронь на уехавший рейс висела бы «в ожидании» до 03:00.
 */
export const runPredictorExpireSweep = async (): Promise<void> => {
   await predictor.runExpireSweep();
};
