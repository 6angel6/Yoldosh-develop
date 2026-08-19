import logger from '../../../shared/utils/logger';
import db from '../../../shared/config/database';
import { Transaction } from 'sequelize';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { PaymentProvider, PaymentStatus } from '../models/Payment';
import { TransactionStatus, TransactionType } from '../models/Transaction';
import Booking, { BookingStatus } from '../../booking/models/Booking';
import * as transactionRepository from '../repository/transactionRepository';
import * as paymentRepository from '../repository/paymentRepository';
import * as bookingRepository from '../../booking/repository/bookingRepository';
import * as userCardRepository from '../repository/userCardRepository';

import { NotFoundError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import * as walletRepository from '../repository/walletRepository';
import Wallet from '../models/Wallet';
import dotenv from 'dotenv';
import * as ipakYoliApi from '../../../shared/api/ipakYoli/ipakApi';
import * as tripRepository from '../../trips/repository/tripRepository';
import { publishPaymentNotification } from '../../workers/queues/notificationQueue';

dotenv.config();

interface InitiatePaymentArgs {
   userId: string;
   walletId?: string;
   amount: number;
   description: string;
   relatedEntityId: string;
   relatedEntityType: string;
   transactionType: TransactionType;
   booking?: Booking;
   userCardId?: string;
}

interface DepositArgs {
   userId: string;
   wallet: Wallet;
   amount: number;
   description: string;
   relatedEntityId: string;
   relatedEntityType: string;
   transactionType: TransactionType;
   userCardId: string;
}

interface IpakCallbackPayload {
   tokenizedContractId: string;
   status: 'success' | 'failed';
   amount: number;
   orderId: string;
   details?: any;
}

export const handlePaymentSuccessCallback = async (
   payload: IpakCallbackPayload,
) => {
   const { orderId, amount, status, tokenizedContractId, details } = payload;

   logger.info({ orderId, status }, 'Processing Payment Success Callback');

   const _notif = await withDeadlockRetry(
      async (t) => {
         const transaction = await transactionRepository.findTransactionById(
            orderId,
            t,
         );

         if (!transaction) {
            throw new NotFoundError(`Transaction with id ${orderId} not found`);
         }

         if (transaction.status === TransactionStatus.COMPLETED) {
            logger.warn(
               { orderId },
               'Transaction already completed. Ignoring callback.',
            );
            return null;
         }

         const payment = await paymentRepository.findPaymentByTransactionId(
            orderId,
            t,
         );

         if (payment) {
            await paymentRepository.updatePaymentStatusByTransId(
               payment,
               PaymentStatus.SUCCESS,
               t,
            );
         } else {
            await paymentRepository.createPayment(
               {
                  transactionId: transaction.id,
                  provider: PaymentProvider.IPAK,
                  providerTransactionId: tokenizedContractId,
                  status: PaymentStatus.SUCCESS,
                  amount: amount,
                  rawResponse: payload,
               },
               t,
            );
         }

         let notifData: {
            recipientId: string;
            paymentId: string;
            amount: number;
            status: string;
         } | null = null;

         if (
            transaction.type === TransactionType.DEPOSIT &&
            transaction.walletId
         ) {
            const wallet = await walletRepository.findWalletWithLock(
               transaction.walletId,
               t,
            );
            if (wallet) {
               await walletRepository.changeWalletBalance(wallet, amount, t);
               logger.info(
                  { walletId: wallet.id, amount },
                  'Wallet balance updated successfully via callback.',
               );

               notifData = {
                  recipientId: wallet.userId,
                  paymentId: transaction.id,
                  amount: transaction.amount,
                  status: transaction.status,
               };
            } else {
               // Лог живёт на границе (callBackIpak); здесь только доменная ошибка
               throw new NotFoundError(
                  'Wallet not found for deposit',
                  ErrorCode.PAYMENT_NOT_FOUND,
               );
            }
         }

         if (
            transaction.relatedEntityType === 'booking' &&
            transaction.relatedEntityId
         ) {
            const booking = await bookingRepository.findBookingByOptions({
               id: transaction.relatedEntityId,
               transaction: t,
            });

            if (booking) {
               await bookingRepository.updateBookingStatus(
                  booking.id,
                  BookingStatus.CONFIRMED,
                  t,
               );

               const trip = await tripRepository.findTripById(
                  booking.tripId,
                  t,
               );
               if (!trip)
                  throw new NotFoundError(
                     `Trip ${booking.tripId} not found.`,
                     ErrorCode.TRIP_NOT_FOUND,
                  );

               if (trip.seats_available >= booking.seatsBooked) {
                  await tripRepository.updateTripSeatsAvailable(
                     trip,
                     trip.seats_available - booking.seatsBooked,
                     t,
                  );
               } else {
                  logger.warn(
                     { tripId: trip.id, bookingId: booking.id },
                     'Not enough seats, but payment succeeded. Manual resolution required.',
                  );
               }
            }
         }

         await transactionRepository.updateTransactionStatus(
            transaction,
            TransactionStatus.COMPLETED,
            t,
         );

         try {
            logger.info(
               { transactionId: transaction.id },
               'Attempting to generate fiscal receipt...',
            );
         } catch (fiscalError) {
            logger.error(
               { err: fiscalError, transactionId: transaction.id },
               'CRITICAL: Failed to generate fiscal receipt after successful payment.',
            );
         }

         logger.info(
            { orderId },
            'Callback processed successfully. Transaction completed.',
         );

         return notifData;
         // READ COMMITTED + FOR UPDATE: конкурентные изменения баланса
         // сериализуются на локе строки, без 40001 при REPEATABLE READ
      },
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
   );

   // Уведомление ПОСЛЕ коммита транзакции — не дублируется при deadlock retry
   if (_notif) {
      publishPaymentNotification({
         recipientId: _notif.recipientId,
         eventType: 'payment_wallet',
         metadata: {
            paymentId: _notif.paymentId,
            amount: _notif.amount,
            status: _notif.status,
         },
         translation: {
            key: 'notification.payment.wallet_deposit',
            params: {
               amount: amount.toString(),
            },
            titleKey: 'title.payment.wallet',
         },
      }).catch((err) =>
         logger.error(
            { err, recipientId: _notif.recipientId },
            'Failed to send payment wallet notification',
         ),
      );
   }
};

export const handlePaymentFailedCallback = async (
   payload: IpakCallbackPayload,
) => {
   const { orderId, amount, status, tokenizedContractId } = payload;

   logger.info({ orderId, status }, 'Processing Payment Failed Callback');

   const _notif = await withDeadlockRetry(async (t) => {
      const transaction = await transactionRepository.findTransactionById(
         orderId,
         t,
      );

      if (!transaction) {
         throw new NotFoundError(`Transaction with id ${orderId} not found`);
      }

      if (transaction.status === TransactionStatus.COMPLETED) {
         logger.warn(
            { orderId },
            'Transaction already completed. Ignoring failed callback.',
         );
         return null;
      }

      const payment = await paymentRepository.findPaymentByTransactionId(
         orderId,
         t,
      );

      if (payment) {
         await paymentRepository.updatePaymentStatusByTransId(
            payment,
            PaymentStatus.FAILED,
            t,
         );
      } else {
         await paymentRepository.createPayment(
            {
               transactionId: transaction.id,
               provider: PaymentProvider.IPAK,
               providerTransactionId: tokenizedContractId,
               status: PaymentStatus.FAILED,
               amount: amount,
               rawResponse: payload,
            },
            t,
         );
      }

      await transactionRepository.updateTransactionStatus(
         transaction,
         TransactionStatus.FAILED,
         t,
      );

      let notifData: {
         recipientId: string;
         paymentId: string;
         amount: number;
         status: string;
      } | null = null;

      if (
         transaction.type === TransactionType.DEPOSIT &&
         transaction.walletId
      ) {
         const wallet = await walletRepository.findWalletWithLock(
            transaction.walletId,
            t,
         );
         if (wallet) {
            logger.info(
               { walletId: wallet.id, amount },
               'Wallet balance failed via callback.',
            );

            notifData = {
               recipientId: wallet.userId,
               paymentId: transaction.id,
               amount: transaction.amount,
               status: transaction.status,
            };
         } else {
            throw new NotFoundError(
               'Wallet not found for deposit',
               ErrorCode.PAYMENT_NOT_FOUND,
            );
         }
      }

      if (
         transaction.relatedEntityType === 'booking' &&
         transaction.relatedEntityId
      ) {
         const booking = await bookingRepository.findBookingByOptions({
            id: transaction.relatedEntityId,
            transaction: t,
         });

         if (booking) {
            await bookingRepository.updateBookingStatus(
               booking.id,
               BookingStatus.FAILED,
               t,
            );
         }
      }
      logger.info(
         { orderId },
         'Callback processed successfully. Transaction marked as failed.',
      );

      return notifData;
   });

   // Уведомление ПОСЛЕ коммита транзакции — не дублируется при deadlock retry
   if (_notif) {
      publishPaymentNotification({
         recipientId: _notif.recipientId,
         eventType: 'payment_wallet_failed',
         metadata: {
            paymentId: _notif.paymentId,
            amount: _notif.amount,
            status: _notif.status,
         },
         translation: {
            key: 'notification.payment.wallet_deposit_failed',
            params: {
               amount: amount.toString(),
            },
            titleKey: 'title.payment.wallet',
         },
      }).catch((err) =>
         logger.error(
            { err, recipientId: _notif.recipientId },
            'Failed to send payment wallet failed notification',
         ),
      );
   }
};

export const depositToWallet = async (args: DepositArgs) => {
   const {
      userId,
      wallet,
      amount,
      description,
      transactionType,
      relatedEntityId,
      relatedEntityType,
      userCardId,
   } = args;

   logger.info(
      { userId, walletId: wallet.id, amount },
      'Starting wallet deposit process.',
   );

   return withDeadlockRetry(async (t) => {
      const userCard = await userCardRepository.getCardById(userCardId, t);
      if (!userCard) {
         throw new NotFoundError('Card not found.');
      }

      if (userCard.userId !== userId) {
         throw new NotFoundError('Card does not belong to this user.');
      }

      if (!userCard.contractId || userCard.cardType === 'NONE') {
         throw new NotFoundError(
            'Card is not confirmed yet. Please complete card verification first.',
         );
      }

      logger.info(
         {
            cardId: userCard.id,
            contractId: userCard.contractId,
            cardNumber: userCard.cardNumber,
            expiry: userCard.expiry,
            cardType: userCard.cardType,
         },
         'Card data from database before IPAK verification',
      );

      logger.info(
         { contractId: userCard.contractId, cardId: userCard.id },
         'Verifying contract with IPAK before payment...',
      );

      let contractData;
      try {
         contractData = await ipakYoliApi.ContractGet({
            contract_id: userCard.contractId,
         });

         logger.info(
            {
               contractData: {
                  contract_id: contractData.contract_id,
                  client_id: contractData.client_id,
                  status: contractData.status,
                  card: contractData.card,
               },
            },
            'Contract data received from IPAK',
         );
      } catch (error) {
         logger.error(
            {
               error: error instanceof Error ? error.message : String(error),
               contractId: userCard.contractId,
               cardId: userCard.id,
            },
            'Failed to verify contract with IPAK',
         );
         throw new NotFoundError(
            'Card contract not found or invalid with payment provider. Please delete this card and create a new one.',
         );
      }

      if (contractData.status !== 'active') {
         logger.warn(
            {
               contractStatus: contractData.status,
               contractId: userCard.contractId,
            },
            'Contract is not active',
         );
         throw new NotFoundError(
            `Card is not active (status: ${contractData.status}). Please delete this card and create a new one.`,
         );
      }

      if (!contractData.card || !contractData.card.pan_masked) {
         logger.error(
            { contractData },
            'Contract has no valid card data in IPAK',
         );
         throw new NotFoundError(
            'Card data is incomplete in payment provider. Please delete this card and create a new one.',
         );
      }

      if (userCard.cardNumber !== contractData.card.pan_masked) {
         logger.warn(
            {
               dbCardNumber: userCard.cardNumber,
               ipakCardNumber: contractData.card.pan_masked,
            },
            'Card number mismatch between database and IPAK',
         );
      }

      if (userCard.expiry !== contractData.card.expiry) {
         logger.warn(
            {
               dbExpiry: userCard.expiry,
               ipakExpiry: contractData.card.expiry,
            },
            'Card expiry mismatch between database and IPAK',
         );
      }

      logger.info(
         {
            contractId: userCard.contractId,
            cardMasked: contractData.card.pan_masked,
            status: contractData.status,
         },
         'Contract verified successfully with IPAK',
      );

      const transaction = await transactionRepository.createTransaction(
         {
            walletId: wallet.id,
            type: transactionType,
            amount: amount,
            status: TransactionStatus.PENDING,
            description: description,
            relatedEntityId: relatedEntityId,
            relatedEntityType: relatedEntityType,
         },
         t,
      );

      logger.info(
         { transactionId: transaction.id, cardId: userCard.id, amount: amount },
         'Calling IPAK Payment API...',
      );

      const response = await ipakYoliApi.paymentPay({
         contract_id: userCard.contractId,
         order_id: transaction.id,
         amount: amount,
      });

      const ipakTransactionId = response.transfer_id;
      logger.info(
         { ipakTransactionId },
         'IPAK payment initiated successfully.',
      );

      await paymentRepository.createPayment(
         {
            transactionId: transaction.id,
            provider: PaymentProvider.IPAK,
            providerTransactionId: ipakTransactionId.toString(),
            status: PaymentStatus.PENDING,
            amount: amount,
            rawResponse: response,
         },
         t,
      );

      logger.info(
         { userId, walletId: wallet.id, amount },
         'Wallet deposit transaction created (PENDING). Waiting for callback.',
      );

      return {
         walletId: wallet.id,
         amount: amount,
         transactionId: transaction.id,
      };
   });
};
