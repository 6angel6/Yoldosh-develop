import Wallet from '../models/Wallet';
import logger from '../../../shared/utils/logger';
import { Transaction } from 'sequelize';
import { Decimal } from 'decimal.js';
import { clearCache } from '../../../shared/config/redis';

export interface CreateWalletData {
   userId: string;
   balance: number;
}

export const createWallet = async (
   data: CreateWalletData,
   transaction?: Transaction,
): Promise<Wallet> => {
   return await Wallet.create(data, { transaction });
};

export const findWalletWithLock = async (
   walletId: string,
   transaction?: Transaction,
): Promise<Wallet | null> => {
   return await Wallet.findOne({
      where: { id: walletId },
      transaction,
      lock: transaction.LOCK.UPDATE,
   });
};

export const findWalletByUserIdWithLock = async (
   userId: string,
   transaction: Transaction,
): Promise<Wallet | null> => {
   return await Wallet.findOne({
      where: { userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
   });
};

export const findWalletByUserId = async (
   userId: string,
   transaction?: Transaction,
): Promise<Wallet | null> => {
   const queryOptions: any = {
      where: { userId },
   };

   if (transaction) {
      queryOptions.transaction = transaction;
   }

   return await Wallet.findOne(queryOptions);
};

export const changeWalletBalance = async (
   wallet: Wallet,
   changeAmount: number | Decimal,
   t?: Transaction,
): Promise<Wallet> => {
   const currentBalance = new Decimal(wallet.balance);
   const amountToChange = new Decimal(changeAmount);
   const newBalance = currentBalance.plus(amountToChange).toNumber();

   const wasNegative = currentBalance.lt(0);
   const willBeNegative = newBalance < 0;

   wallet.balance = newBalance;
   const saved = await wallet.save({ transaction: t });

   // Если баланс пересёк границу 0 — меняется видимость водителя в поиске
   // (триггер БД переключает users.is_wallet_blocked). Чистим кэш поиска,
   // чтобы изменение вступило в силу моментально, а не через 5 мин TTL
   if (wasNegative !== willBeNegative) {
      clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Cache invalidation failed'),
      );
   }

   return saved;
};
