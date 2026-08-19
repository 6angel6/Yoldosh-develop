import { Transaction } from 'sequelize';
import DriverPattern, {
   DriverPatternCreationAttributes,
} from '../models/DriverPattern';

export interface PatternRouteKey {
   driverId: string;
   fromCityId: string;
   toCityId: string;
}

/**
 * Паттерн — один на маршрут водителя (время выезда не входит в ключ: регулярность
 * определяется по маршруту, время опционально). Возвращает паттерн этого
 * водителя+маршрута, если есть. Блокирует строку (FOR UPDATE) в транзакции, чтобы
 * параллельные импорты не создали два паттерна на один маршрут.
 */
export const findMatchingPattern = async (
   key: PatternRouteKey,
   transaction?: Transaction,
): Promise<DriverPattern | null> => {
   return DriverPattern.findOne({
      where: {
         driver_id: key.driverId,
         from_city_id: key.fromCityId,
         to_city_id: key.toCityId,
      },
      transaction,
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
   });
};

export const createPattern = async (
   data: DriverPatternCreationAttributes,
   transaction?: Transaction,
): Promise<DriverPattern> => {
   return DriverPattern.create(data, { transaction });
};

export const savePattern = async (
   pattern: DriverPattern,
   transaction?: Transaction,
): Promise<DriverPattern> => {
   return pattern.save({ transaction });
};

export const findById = async (
   id: string,
   transaction?: Transaction,
): Promise<DriverPattern | null> => {
   return DriverPattern.findByPk(id, { transaction });
};

/** Активные паттерны — для ежедневного долива горизонта (cron). */
export const findActivePatterns = async (): Promise<DriverPattern[]> => {
   return DriverPattern.findAll({ where: { status: 'active' } });
};
