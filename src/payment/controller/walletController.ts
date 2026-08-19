import { Request, Response } from 'express';
import logger from '../../../shared/utils/logger';
import * as walletService from '../service/walletService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import * as paymentService from '../service/paymentService';
import { TransactionType } from '../models/Transaction';
import { AppError } from '../../../shared/utils/errorHandler';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';

export const getMyWallet = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;

      if (!userId) {
         return apiResponse.unauthorized(
            res,
            'User ID not found in token or unauthorized.',
         );
      }

      const wallet = await walletService.getWalletByUserId(userId);

      return apiResponse.success(
         res,
         wallet,
         'User wallet retrieved successfully.',
         200,
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyWallet',
            userId: req.user?.id,
         },
         'Failed to fetch your wallet. Please try again.',
      );
   }
};

export const getAllTransactionsByWallet = async (
   req: Request,
   res: Response,
) => {
   try {
      const userId = req.user.id;

      const parsed = paginationQuerySchema.safeParse(req.query);
      if (!parsed.success) {
         // Текст прежней ручной проверки — форма ответа не меняется
         return apiResponse.badRequest(
            res,
            'Parameters "page" and "limit" must be positive numbers.',
         );
      }
      const { page = 1, limit = 10 } = parsed.data;

      const result = await walletService.getAllTransactionsByWallet(
         userId,
         page,
         limit,
      );

      return apiResponse.success(
         res,
         result,
         'Wallet transactions retrieved successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllTransactionsByWallet',
            userId: req.user?.id,
         },
         'Failed to retrieve wallet transactions. Please try again.',
      );
   }
};

export const depositToWallet = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      // В Express 5 req.body бывает undefined — деструктуризация давала
      // TypeError и 500
      const { userCardId, amount } = req.body ?? {};

      if (!userCardId) {
         return apiResponse.badRequest(res, 'userCardId must be provided');
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
         return apiResponse.badRequest(
            res,
            'Invalid amount provided. Must be a positive number.',
         );
      }

      const wallet = await walletService.getWalletByUserId(userId);

      const result = await paymentService.depositToWallet({
         userId: userId,
         wallet: wallet,
         amount: amount,
         description: `Deposit to wallet ${amount} UZS`,
         transactionType: TransactionType.DEPOSIT,
         relatedEntityId: wallet.id,
         relatedEntityType: 'wallet',
         userCardId: userCardId,
      });

      return apiResponse.success(res, result, 'Deposit successful');
   } catch (error) {
      const userId = req.user?.id;
      const { userCardId, amount } = req.body ?? {};

      if (error instanceof AppError) {
         logger.warn(
            { err: error, userId, userCardId, amount },
            'Deposit to wallet failed with a known error.',
         );
         return apiResponse.error(res, error.message, error.statusCode);
      }
      logger.error(
         { err: error, userId, userCardId, amount },
         'Deposit to wallet failed with an unexpected error.',
      );
      const errorMessage =
         error instanceof Error ? error.message : 'Unknown error';
      return apiResponse.internalError(
         res,
         `Failed to initiate deposit: ${errorMessage}`,
      );
   }
};
