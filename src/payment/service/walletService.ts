import logger from '../../../shared/utils/logger';
import { TransactionStatus } from '../models/Transaction';
import * as userRepository from '../../auth/repository/authRepository';
import * as walletRepository from '../repository/walletRepository';
import * as transactionRepository from '../repository/transactionRepository';
import { NotFoundError } from '../../../shared/utils/errorHandler';

export const getWalletByUserId = async (userId: string) => {
   const foundUser = await userRepository.findUserById(userId);
   if (!foundUser) {
      throw new NotFoundError(`User with id ${userId} not found`);
   }

   const userWallet = await walletRepository.findWalletByUserId(foundUser.id);
   if (!userWallet) {
      throw new NotFoundError('Wallet not found. Only drivers have wallets.');
   }

   logger.debug({ userId, walletId: userWallet.id }, 'Fetched wallet');
   return userWallet;
};

export const getAllTransactionsByWallet = async (
   userId: string,
   page: number = 1,
   limit: number = 10,
): Promise<{
   transactions: any[];
   total: number;
   totalPages: number;
   currentPage: number;
}> => {
   const offset = (page - 1) * limit;

   const wallet = await walletRepository.findWalletByUserId(userId);

   if (!wallet) {
      return {
         transactions: [],
         total: 0,
         totalPages: 0,
         currentPage: page,
      };
   }

   const { count, rows: transactions } =
      await transactionRepository.findTransactionsByWalletId(
         wallet.id,
         [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED],
         limit,
         offset,
      );

   return {
      transactions,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};
