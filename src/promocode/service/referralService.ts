import * as referralRepository from '../repository/referralRepository';
import logger from '../../../shared/utils/logger';
import { InternalServerError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import { ReferralStatus } from '../models/Referral';
import { Decimal } from 'decimal.js';
import { Transaction } from 'sequelize';
import * as walletRepository from '../../payment/repository/walletRepository';
import * as transactionRepository from '../../payment/repository/transactionRepository';
import {
   TransactionStatus,
   TransactionType,
} from '../../payment/models/Transaction';
import * as crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import db from '../../../shared/config/database';

const generateRefCode = customAlphabet(
   'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
   8,
);

export const getUserReferralCode = async (userId: string) => {
   return await referralRepository.getReferralCode(userId);
};

export const generateAndSaveCodeForUser = async (userId: string) => {
   let existingCode = await referralRepository.getReferralCode(userId);
   if (existingCode) {
      logger.info({ userId }, 'Referral code already exists for user.');
      return existingCode;
   }

   let code: string;
   let attempts = 0;
   const maxAttempts = 5;
   do {
      code = generateRefCode();
      existingCode = await referralRepository.findCodeByCode(code);
      attempts++;
   } while (existingCode && attempts < maxAttempts);

   if (existingCode) {
      throw new InternalServerError(
         `Could not generate a unique referral code after ${maxAttempts} attempts.`,
         ErrorCode.REFERRAL_CODE_GENERATION_FAILED,
      );
   }

   const refCode = await referralRepository.createReferralCode({
      userId: userId,
      code: code,
      isActive: true,
   });
   if (!refCode) {
      throw new InternalServerError(
         `Could not create referral code for user ${userId}`,
         ErrorCode.REFERRAL_CODE_GENERATION_FAILED,
      );
   }
   logger.info({ userId, code }, 'Generated and saved new referral code.');
   return refCode;
};

export const processReferralCode = async (
   referredUserId: string,
   code: string,
) => {
   logger.info(
      { referredUserId, code },
      'Attempting to process referral code.',
   );

   const referralCode = await referralRepository.findCodeByCode(code);

   if (!referralCode) {
      logger.warn({ referredUserId, code }, 'Referral code not found.');
      return;
   }

   if (!referralCode.isActive) {
      logger.warn({ referredUserId, code }, 'Referral code is not active.');
      return;
   }

   const referrerId = referralCode.userId;
   if (referrerId === referredUserId) {
      logger.warn({ referredUserId, code }, 'User attempted self-referral.');
      return;
   }

   const existingReferral =
      await referralRepository.findReferralByReferredUserId(referredUserId);
   if (existingReferral) {
      logger.warn(
         { referredUserId, code },
         'This user has already been referred.',
      );
      return;
   }

   try {
      await withDeadlockRetry(
         async (t) => {
            await referralRepository.createReferral(
               {
                  referralCodeId: referralCode.id,
                  referrerId: referrerId,
                  referredUserId: referredUserId,
                  status: ReferralStatus.COMPLETED,
               },
               t,
            );

            logger.info(
               { referredUserId, referrerId, code },
               'Referral record created successfully.',
            );

            const reward = await referralRepository.findActiveReward(t);
            if (reward) {
               const rewardAmount = new Decimal(reward.rewardAmount);

               const referrerWallet =
                  await walletRepository.findWalletByUserIdWithLock(
                     referrerId,
                     t,
                  );
               if (referrerWallet) {
                  await walletRepository.changeWalletBalance(
                     referrerWallet,
                     rewardAmount,
                     t,
                  );
                  await transactionRepository.createTransaction(
                     {
                        walletId: referrerWallet.id,
                        type: TransactionType.DEPOSIT,
                        amount: rewardAmount.toNumber(),
                        status: TransactionStatus.COMPLETED,
                        description: `Бонус за приглашение пользователя ${referredUserId.substring(0, 8)}`,
                        relatedEntityId: referredUserId,
                        relatedEntityType: 'referral_bonus',
                     },
                     t,
                  );
                  logger.info(
                     { referrerId, amount: rewardAmount.toNumber() },
                     'Referral bonus credited to referrer.',
                  );
               } else {
                  logger.warn(
                     { referrerId },
                     'Referrer wallet not found, bonus not credited.',
                  );
               }

               // FOR UPDATE, как и выше: начисление не должно терять конкурентное
               // изменение баланса
               const referredWallet =
                  await walletRepository.findWalletByUserIdWithLock(
                     referredUserId,
                     t,
                  );
               if (referredWallet) {
                  await walletRepository.changeWalletBalance(
                     referredWallet,
                     rewardAmount,
                     t,
                  );
                  await transactionRepository.createTransaction(
                     {
                        walletId: referredWallet.id,
                        type: TransactionType.DEPOSIT,
                        amount: rewardAmount.toNumber(),
                        status: TransactionStatus.COMPLETED,
                        description: `Бонус за регистрацию по приглашению от ${referrerId.substring(0, 8)}`,
                        relatedEntityId: referrerId,
                        relatedEntityType: 'referral_bonus',
                     },
                     t,
                  );
                  logger.info(
                     { referredUserId, amount: rewardAmount.toNumber() },
                     'Referral bonus credited to referred user.',
                  );
               } else {
                  logger.error(
                     { referredUserId },
                     'Referred user wallet not found immediately after creation!',
                  );
               }
            } else {
               logger.info(
                  { referredUserId, code },
                  'No active referral reward found, bonus not credited.',
               );
            }
            // READ COMMITTED + FOR UPDATE: начисления сериализуются на локе
            // строки кошелька, без 40001 при REPEATABLE READ
         },
         { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      );
   } catch (error) {
      logger.error(
         { err: error, referredUserId, code },
         'Failed to create referral record or apply bonus.',
      );
   }
};
