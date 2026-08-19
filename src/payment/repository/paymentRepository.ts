import Payment, { PaymentProvider, PaymentStatus } from '../models/Payment';
import Transaction, {
   TransactionStatus,
   TransactionType,
} from '../models/Transaction';
import { Op, Transaction as SequelizeTransaction } from 'sequelize';
import FiscalReceipt from '../models/FiscalReceipt';

export interface CreatePaymentData {
   transactionId: string;
   provider: PaymentProvider;
   providerTransactionId: string;
   userCardId?: string;
   status: PaymentStatus;
   amount: number;
   rawResponse: any;
}

export interface CreateFiscal {
   transactionId: string;
   ofdLink: string;
}

export const createPayment = async (
   data: CreatePaymentData,
   transaction?: SequelizeTransaction,
): Promise<Payment> => {
   return await Payment.create(data, { transaction });
};

export const createFiscal = async (
   data: CreateFiscal,
   transaction?: SequelizeTransaction,
): Promise<FiscalReceipt> => {
   return await FiscalReceipt.create(data, { transaction });
};

export const updatePaymentStatus = async (
   payment: Payment,
   status: PaymentStatus,
   transaction?: SequelizeTransaction,
): Promise<Payment> => {
   payment.status = status;
   return await payment.save({ transaction });
};

export const findPaymentByBookingId = async (
   bookingId: string,
   transaction?: SequelizeTransaction,
) => {
   return await Payment.findOne({
      include: [
         {
            model: Transaction,
            as: 'transaction',
            where: {
               relatedEntityId: bookingId,
               relatedEntityType: 'booking',
            },
         },
      ],
      where: {
         status: PaymentStatus.SUCCESS,
      },
      transaction,
   });
};

export const findPaymentByProviderId = async (
   providerId: string,
   transaction?: SequelizeTransaction,
) => {
   return await Payment.findOne({
      where: { providerTransactionId: providerId },
      transaction,
   });
};

export const findPaymentByDate = async (
   dateFrom: string,
   dateTo: string,
   transaction?: SequelizeTransaction,
) => {
   return await Payment.findAll({
      where: {
         provider: PaymentProvider.PAYNET,
         createdAt: {
            [Op.between]: [new Date(dateFrom), new Date(dateTo)],
         },
      },
      include: [
         {
            model: Transaction,
            as: 'transaction',
            where: {
               status: TransactionStatus.COMPLETED,
               type: TransactionType.DEPOSIT,
            },
            required: true,
         },
      ],
      order: [['createdAt', 'ASC']],
      transaction,
   });
};

export const findFiscalReceiptByTransactionId = async (
   transactionId: string,
   transaction?: SequelizeTransaction,
): Promise<FiscalReceipt | null> => {
   return await FiscalReceipt.findOne({
      where: { transactionId },
      transaction,
   });
};

export const findPaymentByTransactionId = async (
   transactionId: string,
   transaction?: SequelizeTransaction,
): Promise<Payment | null> => {
   return await Payment.findOne({ where: { transactionId }, transaction });
};

export const updatePaymentStatusByTransId = async (
   payment: Payment,
   status: PaymentStatus,
   transaction?: SequelizeTransaction,
): Promise<Payment> => {
   payment.status = status;

   return await payment.save({ transaction });
};
