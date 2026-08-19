import Transaction, {
   TransactionStatus,
   TransactionType,
} from '../models/Transaction';
import { Transaction as SequelizeTransaction } from 'sequelize';

export interface CreateTransactionData {
   walletId?: string;
   type: TransactionType;
   amount: number;
   status: TransactionStatus;
   description: string;
   relatedEntityId?: string;
   relatedEntityType?: string;
}

export const createTransaction = async (
   data: CreateTransactionData,
   transaction?: SequelizeTransaction,
): Promise<Transaction> => {
   return await Transaction.create(data, { transaction });
};

export const findTransactionById = async (
   transactionId: string,
   transaction?: SequelizeTransaction,
) => {
   return await Transaction.findOne({
      where: { id: transactionId },
      transaction,
   });
};

export const updateTransactionStatus = async (
   transactionInstance: Transaction,
   status: TransactionStatus,
   transaction?: SequelizeTransaction,
): Promise<Transaction> => {
   transactionInstance.status = status;
   return await transactionInstance.save({ transaction });
};

export const findTransactionByBooking = async (
   bookingId: string,
   transaction?: SequelizeTransaction,
): Promise<Transaction> => {
   return await Transaction.findOne({
      where: { relatedEntityId: bookingId },
      transaction,
   });
};

export const findTransactionsByWalletId = async (
   walletId: string,
   statuses: TransactionStatus[],
   limit: number,
   offset: number,
): Promise<{ count: number; rows: Transaction[] }> => {
   return await Transaction.findAndCountAll({
      where: {
         walletId,
         status: statuses,
      },
      attributes: [
         'id',
         'type',
         'amount',
         'status',
         'description',
         'createdAt',
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
   });
};
