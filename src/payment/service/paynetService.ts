import { PaynetError } from '../../../shared/utils/errorHandler';
import * as transactionRepository from '../repository/transactionRepository';
import * as paymentRepository from '../repository/paymentRepository';
import TransactionModel, {
   TransactionStatus,
   TransactionType,
} from '../models/Transaction';
import logger from '../../../shared/utils/logger';
import db from '../../../shared/config/database';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { Decimal } from 'decimal.js';
import * as userRepository from '../../user/repository/userRepository';
import * as walletRepository from '../repository/walletRepository';
import { PaymentProvider, PaymentStatus } from '../models/Payment';
import { Transaction } from 'sequelize';
import { PAYNET_SERVICE_ID_INT } from '../../../shared/api/paynet/paynetConfig';

export const getInformation = async (params: any) => {
   const { serviceId, fields } = params;
   if (serviceId !== PAYNET_SERVICE_ID_INT) {
      throw new PaynetError('Service not found.', 305);
   }
   if (!fields?.client_id) {
      throw new PaynetError(
         'Required parameter "client_id" is missing.',
         -32602,
      );
   }
   const clientId = fields.client_id.toString();
   const phoneNumberToSearch = clientId.startsWith('+')
      ? clientId
      : `+${clientId}`;

   const user = await userRepository.findUserByPhoneNumber(phoneNumberToSearch);
   if (!user) {
      throw new PaynetError('Client not found.', 302);
   }

   const wallet = await walletRepository.findWalletByUserId(user.id);
   if (!wallet) {
      throw new PaynetError(`Wallet for user ${user.id} not found.`, 302);
   }

   return {
      status: '0',
      timestamp: new Date().toISOString(),
      fields: {
         name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
         balance: new Decimal(wallet.balance).mul(100).toNumber(),
      },
   };
};

export const performTransaction = async (params: any) => {
   const { amount, serviceId, transactionId, fields } = params;

   if (serviceId !== PAYNET_SERVICE_ID_INT) {
      throw new PaynetError('Service not found.', 305);
   }

   if (!amount || !transactionId || !fields?.client_id) {
      throw new PaynetError('Missing required parameters.', -32602);
   }

   const existingPayment = await paymentRepository.findPaymentByProviderId(
      transactionId.toString(),
   );

   if (existingPayment) {
      logger.warn(
         { paynetTransactionId: transactionId },
         'Duplicate PerformTransaction request received. Responding with error 201.',
      );
      throw new PaynetError('Transacton is alreary exist', 201);
   }

   let internalTransaction;

   return withDeadlockRetry(
      async (t) => {
         const clientId = fields.client_id.toString();
         const phoneNumberToSearch = clientId.startsWith('+')
            ? clientId
            : `+${clientId}`;
         const user = await userRepository.findUserByPhoneNumber(
            phoneNumberToSearch,
            t,
         );
         if (!user) throw new PaynetError('Client not found.', 302);

         // FOR UPDATE: конкурентное пополнение того же кошелька без блокировки
         // теряло одно из обновлений (read-modify-write по устаревшему балансу)
         const wallet = await walletRepository.findWalletByUserIdWithLock(
            user.id,
            t,
         );
         if (!wallet)
            throw new PaynetError(`Wallet for user ${user.id} not found.`, 302);

         const amountInSoms = new Decimal(amount).dividedBy(100);

         internalTransaction = await transactionRepository.createTransaction(
            {
               walletId: wallet.id,
               type: TransactionType.DEPOSIT,
               amount: amountInSoms.toNumber(),
               status: TransactionStatus.PENDING,
               description: `Paynet deposit. Paynet Transaction ID: ${transactionId.toString()}`,
               relatedEntityType: 'PAYNET_PAYMENT',
            },
            t,
         );

         const payment = await paymentRepository.createPayment(
            {
               transactionId: internalTransaction.id,
               provider: PaymentProvider.PAYNET,
               providerTransactionId: transactionId.toString(),
               status: PaymentStatus.PENDING,
               amount: amountInSoms.toNumber(),
               rawResponse: params,
            },
            t,
         );

         await walletRepository.changeWalletBalance(wallet, amountInSoms, t);

         await internalTransaction.update(
            { status: TransactionStatus.COMPLETED },
            { transaction: t },
         );

         await payment.update(
            { status: PaymentStatus.SUCCESS },
            { transaction: t },
         );

         logger.info({}, 'Wallet successfully topped up via Paynet.');

         return {
            providerTrnId: internalTransaction.id,
            timestamp: new Date().toISOString(),
            fields: fields,
         };
         // READ COMMITTED + FOR UPDATE: конкурентные пополнения сериализуются на
         // локе строки. При REPEATABLE READ конкурентное обновление давало 40001,
         // и после исчерпания ретраев пополнение падало.
      },
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
   );
};

export const checkTransaction = async (params: any) => {
   const { serviceId, transactionId } = params;

   if (serviceId !== PAYNET_SERVICE_ID_INT) {
      throw new PaynetError('Service not found.', 305);
   }

   if (!transactionId) {
      throw new PaynetError('transactionId is required.', -32602);
   }

   const payment = await paymentRepository.findPaymentByProviderId(
      transactionId.toString(),
   );

   if (!payment) {
      return { transactionState: 3, timestamp: new Date().toISOString() };
   }

   const internalTransaction = await transactionRepository.findTransactionById(
      payment.transactionId,
   );
   if (!internalTransaction) {
      throw new PaynetError('Internal transaction record not found.', 102);
   }

   let transactionState: number;
   switch (internalTransaction.status) {
      case TransactionStatus.COMPLETED:
         transactionState = 1;
         break;
      case TransactionStatus.CANCELLED:
         transactionState = 2;
         break;
      case TransactionStatus.PENDING:
      case TransactionStatus.FAILED:
      default:
         transactionState = 3;
         break;
   }

   return {
      providerTrnId: internalTransaction.id,
      timestamp: internalTransaction.updatedAt.toISOString(),
      transactionState: transactionState,
   };
};

export const cancelTransaction = async (params: any) => {
   const { serviceId, transactionId, timestamp: paynetTimestamp } = params;

   if (serviceId !== PAYNET_SERVICE_ID_INT) {
      throw new PaynetError('Service not found.', 305);
   }

   if (!transactionId) {
      throw new PaynetError('transactionId is required.', -32602);
   }

   logger.info(
      { paynetTimestamp, paynetTransactionId: transactionId },
      'CancelTransaction request received from Paynet.',
   );

   return db.transaction(async (t: Transaction) => {
      const paynetTransactionIdString = transactionId.toString();

      const payment = await paymentRepository.findPaymentByProviderId(
         paynetTransactionIdString,
         t,
      );

      if (!payment) {
         throw new PaynetError('Transaction not found.', 203);
      }

      const internalTransaction =
         await transactionRepository.findTransactionById(
            payment.transactionId,
            t,
         );
      if (!internalTransaction) {
         throw new PaynetError('Internal transaction mismatch.', 102);
      }

      if (
         internalTransaction.status === TransactionStatus.CANCELLED ||
         internalTransaction.status === TransactionStatus.REFUND
      ) {
         throw new PaynetError('Transaction already cancelled.', 202);
      }

      if (internalTransaction.status !== TransactionStatus.COMPLETED) {
         throw new PaynetError(
            'Only completed transactions can be cancelled.',
            102,
         );
      }

      const wallet = await walletRepository.findWalletWithLock(
         internalTransaction.walletId,
         t,
      );
      if (!wallet) {
         throw new PaynetError('Wallet for this transaction not found.', 102);
      }

      const amountToRefund = new Decimal(internalTransaction.amount);

      if (new Decimal(wallet.balance).lessThan(amountToRefund)) {
         throw new PaynetError(
            'Insufficient funds on client account for cancellation.',
            77,
         );
      }

      await walletRepository.changeWalletBalance(
         wallet,
         amountToRefund.negated(),
         t,
      );

      await transactionRepository.updateTransactionStatus(
         internalTransaction,
         TransactionStatus.CANCELLED,
         t,
      );

      await transactionRepository.createTransaction(
         {
            walletId: wallet.id,
            type: TransactionType.REFUND,
            amount: amountToRefund.negated().toNumber(),
            status: TransactionStatus.COMPLETED,
            description: `Refund for Paynet Trn ID: ${transactionId}`,
         },
         t,
      );

      logger.info(
         { paynetTrnId: transactionId, amount: amountToRefund.toNumber() },
         'Transaction successfully cancelled.',
      );

      const formattedTimestamp = new Date()
         .toISOString()
         .replace('T', ' ')
         .substring(0, 19);

      return {
         providerTrnId: internalTransaction.id,
         timestamp: formattedTimestamp,
         transactionState: 2,
      };
   });
};

export const getStatement = async (params: any) => {
   const { dateFrom, dateTo, serviceId } = params;

   if (serviceId !== PAYNET_SERVICE_ID_INT) {
      throw new PaynetError('Service not found.', 305);
   }

   if (!dateFrom || !dateTo) {
      throw new PaynetError('dateFrom and dateTo are required.', -32602);
   }
   const dateFormatRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
   if (!dateFormatRegex.test(dateFrom) || !dateFormatRegex.test(dateTo)) {
      throw new PaynetError(
         'Invalid date format. Expected YYYY-MM-DD HH:mm:ss',
         414,
      );
   }

   const payments = await paymentRepository.findPaymentByDate(dateFrom, dateTo);

   const statements = payments.map((payment) => {
      const transaction = payment.transaction as TransactionModel;

      return {
         amount: new Decimal(transaction.amount).mul(100).toNumber(),
         providerTrnId: transaction.id,
         transactionId: parseInt(payment.providerTransactionId, 10),
         timestamp: transaction.createdAt
            .toISOString()
            .replace('T', ' ')
            .substring(0, 19),
      };
   });

   return {
      statements: statements,
   };
};
