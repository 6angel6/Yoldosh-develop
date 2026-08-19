import { Transaction } from 'sequelize';
import db from '../config/database';
import logger from './logger';

export const withDeadlockRetry = async <T>(
   callback: (transaction: Transaction) => Promise<T>,
   options?: {
      maxRetries?: number;
      isolationLevel?: Transaction.ISOLATION_LEVELS;
      onRetry?: (attempt: number, error: Error) => void;
   },
): Promise<T> => {
   const maxRetries = options?.maxRetries ?? 3;
   const isolationLevel =
      options?.isolationLevel ?? Transaction.ISOLATION_LEVELS.REPEATABLE_READ;

   let lastError: Error | null = null;

   for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const transaction = await db.transaction({ isolationLevel });

      try {
         await db.query('SET LOCAL lock_timeout = 5000', { transaction });
         await db.query('SET LOCAL statement_timeout = 10000', { transaction });

         const result = await callback(transaction);
         await transaction.commit();

         if (attempt > 1) {
            logger.info(
               { attempt, maxRetries },
               'Transaction succeeded after retry',
            );
         }

         return result;
      } catch (error: any) {
         await transaction.rollback();
         lastError = error;

         const isRetryable =
            error.parent?.code === '40001' || // serialization_failure
            error.parent?.code === '40P01' || // deadlock_detected
            error.parent?.code === '55P03' || // lock_not_available (lock_timeout exceeded)
            error.name === 'SequelizeConnectionError';

         if (!isRetryable || attempt === maxRetries) {
            logger.error(
               {
                  error,
                  attempt,
                  maxRetries,
                  errorCode: error.parent?.code,
                  isRetryable,
               },
               'Transaction failed permanently',
            );
            throw error;
         }

         // Exponential backoff: 100ms, 200ms, 400ms
         const delayMs = 100 * Math.pow(2, attempt - 1);

         logger.warn(
            {
               attempt,
               maxRetries,
               delayMs,
               errorCode: error.parent?.code,
               errorMessage: error.message,
            },
            'Transaction deadlock/serialization failure, retrying...',
         );

         if (options?.onRetry) {
            options.onRetry(attempt, error);
         }

         await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
   }

   throw lastError;
};
