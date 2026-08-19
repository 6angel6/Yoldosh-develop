import * as promocodeRepository from '../repository/promocodeRepository';
import * as userRepository from '../../user/repository/userRepository';
import { customAlphabet } from 'nanoid';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import * as adminLogService from '../../admin/log/service/adminLogService';
import { AdminAction } from '../../admin/log/models/AdminLog';
import PromoCode, { PromoCodeType } from '../models/PromoCode';
import { Transaction } from 'sequelize';
import User, { UserRole } from '../../user/models/User';
import logger from '../../../shared/utils/logger';
import db from '../../../shared/config/database';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { findUserPromocodes } from '../repository/promocodeRepository';

const generatePromoCode = customAlphabet(
   'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
   8,
);

interface GrantPromoCodeArgs {
   adminId: string;
   userId?: string;
   discountPercentage: number;
   type: PromoCodeType;
   useAmount?: number;
   expiresAt?: string;
}

export const grantPromoCode = async (args: GrantPromoCodeArgs) => {
   const { adminId, userId, discountPercentage, type, useAmount, expiresAt } =
      args;

   const promoCodeData: any = {
      discountPercentage,
      code: generatePromoCode(),
      type,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
   };

   if (type === PromoCodeType.SINGLE_USER) {
      const user = await userRepository.findUserById(userId);
      if (!user) {
         throw new NotFoundError('User not found.');
      }

      promoCodeData.userId = userId;
   } else {
      promoCodeData.useAmount = useAmount;
   }

   const newPromo = await withDeadlockRetry(async (t) => {
      if (type === PromoCodeType.SINGLE_USER) {
         const existingPromo = await promocodeRepository.findByUserId(
            userId,
            t,
         );
         if (existingPromo) {
            throw new ConflictError('User already has an active promo code.');
         }
      }

      const promo = await promocodeRepository.create(promoCodeData, t);

      if (type === PromoCodeType.SINGLE_USER) {
         const user = await userRepository.findUserById(userId, t);
         if (user) {
            user.isHavePromocode = true;
            await userRepository.saveUser(user, t);
         }
      }

      return promo;
   });

   await adminLogService.logAction(
      adminId,
      AdminAction.CREATE_ADMIN,
      `Granted promo code ${newPromo.code} of type ${type}`,
      newPromo.id,
      'PROMO_CODE',
   );

   return newPromo;
};

export const getAllPromoCodes = async (options: {
   page: number;
   limit: number;
}) => {
   const offset = (options.page - 1) * options.limit;
   const { rows, count } = await promocodeRepository.findAll({
      limit: options.limit,
      offset,
   });
   return {
      promoCodes: rows || [],
      total: count || 0,
      totalPages: Math.ceil((count || 0) / options.limit),
      currentPage: options.page,
   };
};

export const getGlobalPromoCodes = async (): Promise<PromoCode[]> => {
   return promocodeRepository.findByType(PromoCodeType.GLOBAL);
};

export const getUserPromoCodes = async (): Promise<PromoCode[]> => {
   return promocodeRepository.findByType(PromoCodeType.SINGLE_USER);
};

export const deletePromoCode = async (adminId: string, promoCodeId: string) => {
   const promoCode = await promocodeRepository.findById(promoCodeId);
   if (!promoCode) {
      throw new NotFoundError('Promo code not found.');
   }

   // АТОМАРНАЯ транзакция: удаление промокода + обновление user
   await withDeadlockRetry(async (t) => {
      if (promoCode.userId) {
         const user = await userRepository.findUserById(promoCode.userId, t);
         if (user) {
            user.isHavePromocode = false;
            await userRepository.saveUser(user, t);
         }
      }

      await promocodeRepository.deleteById(promoCodeId, t);
   });

   await adminLogService.logAction(
      adminId,
      AdminAction.DELETE_ADMIN,
      `Deleted promo code ${promoCode.code} (ID: ${promoCodeId})`,
      promoCodeId,
      'PROMO_CODE',
   );

   return { message: 'Promo code deleted successfully.' };
};

export const getMyPromoCode = async (userId: string): Promise<PromoCode[]> => {
   const promoCodes = await promocodeRepository.findUserPromocodes(userId);
   return promoCodes;
};

export const deactivatePromoCodeForUser = async (
   userId: string,
   transaction?: Transaction,
) => {
   try {
      const user = await userRepository.findUserById(userId, transaction);
      const promoCode = await promocodeRepository.findByUserId(
         userId,
         transaction,
      );

      if (promoCode) {
         promoCode.isActive = false;
         await promocodeRepository.save(promoCode, transaction);
      }

      if (user) {
         user.isHavePromocode = false;
         await userRepository.saveUser(user, transaction);
      }
   } catch (error) {
      logger.error({ err: error, userId }, 'Error deactivating promocode');
   }
};

export const activateGlobalPromoCode = async (userId: string, code: string) => {
   // Базовая проверка существования промокода (без блокировки)
   const promoCode = await promocodeRepository.findByCode(code);
   if (
      !promoCode ||
      promoCode.type !== PromoCodeType.GLOBAL ||
      !promoCode.isActive
   ) {
      throw new NotFoundError('Promo code not found or is not valid.');
   }

   // АТОМАРНАЯ транзакция: все критичные проверки и изменения
   return withDeadlockRetry(async (t) => {
      // Перечитываем промокод с блокировкой внутри транзакции
      const lockedPromoCode = await promocodeRepository.findByCodeForUpdate(
         code,
         t,
      );

      if (
         !lockedPromoCode ||
         !lockedPromoCode.isActive ||
         (lockedPromoCode.useAmount !== null && lockedPromoCode.useAmount <= 0)
      ) {
         throw new NotFoundError('Promo code not found or is not valid.');
      }

      const user = await userRepository.findUserByIdForUpdate(userId, t);
      if (!user) {
         throw new NotFoundError('User not found.');
      }
      if (user.isHavePromocode) {
         throw new ConflictError('User already has an active promo code.');
      }

      if (lockedPromoCode.useAmount !== null) {
         lockedPromoCode.useAmount -= 1;
         if (lockedPromoCode.useAmount === 0) {
            lockedPromoCode.isActive = false;
         }
      }
      await promocodeRepository.save(lockedPromoCode, t);

      const userPromoCode = await promocodeRepository.create(
         {
            userId,
            code: `${code}-${userId.substring(0, 4)}`,
            discountPercentage: lockedPromoCode.discountPercentage,
            expiresAt: lockedPromoCode.expiresAt,
            type: PromoCodeType.SINGLE_USER,
            isActive: true,
         },
         t,
      );

      user.isHavePromocode = true;
      await userRepository.saveUser(user, t);

      return userPromoCode;
   });
};
