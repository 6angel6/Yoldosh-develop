import { Transaction, Op } from 'sequelize';
import User from '../../user/models/User';
import logger from '../../../shared/utils/logger';
import PromoCode, {
   PromoCodeCreationAttributes,
   PromoCodeType,
} from '../models/PromoCode';

export const create = async (
   data: PromoCodeCreationAttributes,
   transaction?: Transaction,
): Promise<PromoCode> => {
   return PromoCode.create(data, { transaction });
};

export const markPromoCodeAsUsed = async (
   promoCodeId: string,
   transaction: Transaction,
): Promise<void> => {
   await PromoCode.update(
      { isActive: false },
      {
         where: { id: promoCodeId },
         transaction,
      },
   );
};

export const findUserPromocodes = async (
   userId: string,
   transaction?: Transaction,
): Promise<PromoCode[]> => {
   try {
      return await PromoCode.findAll({
         where: {
            userId,
            isActive: true,
            [Op.or]: [
               { expiresAt: null },
               { expiresAt: { [Op.gt]: new Date() } },
            ],
         },
         order: [['createdAt', 'DESC']],
         transaction,
      });
   } catch (error) {
      logger.error(
         { err: error, userId },
         'Error finding promocodes by userId',
      );
      return [];
   }
};

export const findByUserId = async (
   userId: string,
   transaction?: Transaction,
): Promise<PromoCode | null> => {
   return PromoCode.findOne({
      where: {
         userId,
         isActive: true,
         [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
      },
      transaction,
   });
};

export const findById = async (
   id: string,
   transaction?: Transaction,
): Promise<PromoCode | null> => {
   return PromoCode.findByPk(id, { transaction });
};

export const findByCode = async (
   code: string,
   transaction?: Transaction,
): Promise<PromoCode | null> => {
   return PromoCode.findOne({ where: { code }, transaction });
};

export const findByCodeForUpdate = async (
   code: string,
   transaction: Transaction,
): Promise<PromoCode | null> => {
   return PromoCode.findOne({
      where: { code },
      transaction,
      lock: transaction.LOCK.UPDATE,
   });
};

export const findAll = async (options: {
   limit: number;
   offset: number;
}): Promise<{ rows: PromoCode[]; count: number }> => {
   return PromoCode.findAndCountAll({
      limit: options.limit,
      offset: options.offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName'] }],
   });
};

export const findByType = async (
   type: PromoCodeType,
   transaction?: Transaction,
): Promise<PromoCode[]> => {
   return PromoCode.findAll({
      where: { type },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName'] }],
      order: [['createdAt', 'DESC']],
      transaction,
   });
};

export const deleteById = async (
   id: string,
   transaction?: Transaction,
): Promise<number> => {
   return PromoCode.destroy({ where: { id }, transaction });
};

export const save = async (
   promoCode: PromoCode,
   transaction?: Transaction,
): Promise<PromoCode> => {
   return promoCode.save({ transaction });
};
