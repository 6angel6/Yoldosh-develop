import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum TransactionType {
   DEPOSIT = 'DEPOSIT', // Пополнение кошелька
   WITHDRAWAL = 'WITHDRAWAL', // Вывод средств
   PAYMENT = 'PAYMENT', // Оплата поездки (с кошелька или напрямую)
   REFUND = 'REFUND', // Возврат денег за отмену
   COMMISSION = 'COMMISSION', // Наша комиссия
   TRANSFER = 'TRANSFER', // Прямой перевод (например, водителю)
}

export enum TransactionStatus {
   CREATED = 'CREATED',
   PENDING = 'PENDING',
   COMPLETED = 'COMPLETED',
   FAILED = 'FAILED',
   CANCELLED = 'CANCELLED',
   REFUND = 'REFUND',
}

export interface TransactionAttributes {
   id: string;
   walletId?: string; // Может быть null для прямых оплат
   type: TransactionType;
   amount: number; // Сумма в тийинах
   status: TransactionStatus;
   description?: string;
   relatedEntityId?: string;
   relatedEntityType?: string;
   createdAt?: Date;
   updatedAt?: Date;
}

export interface TransactionCreationAttributes
   extends Optional<TransactionAttributes, 'id' | 'status'> {}

class Transaction
   extends Model<TransactionAttributes, TransactionCreationAttributes>
   implements TransactionAttributes
{
   public id!: string;
   public walletId?: string;
   public type!: TransactionType;
   public amount!: number;
   public status!: TransactionStatus;
   public description?: string;
   public relatedEntityId?: string;
   public relatedEntityType?: string;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Transaction.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      walletId: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'wallet_id',
      },
      type: {
         type: DataTypes.ENUM(...Object.values(TransactionType)),
         allowNull: false,
      },
      amount: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
      },
      status: {
         type: DataTypes.ENUM(...Object.values(TransactionStatus)),
         allowNull: false,
         defaultValue: TransactionStatus.CREATED,
      },
      description: {
         type: DataTypes.STRING,
         allowNull: true,
      },
      relatedEntityId: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'related_entity_id',
      },
      relatedEntityType: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'related_entity_type',
      },
   },
   {
      sequelize: db,
      tableName: 'transactions',
      timestamps: true,
      indexes: [
         {
            name: 'idx_transactions_wallet_status',
            fields: ['wallet_id', 'status', 'createdAt'],
         },
         {
            name: 'idx_transactions_related_entity',
            fields: ['related_entity_id', 'related_entity_type'],
         },
         {
            name: 'idx_transactions_type_status',
            fields: ['type', 'status'],
         },
         {
            name: 'idx_transactions_created_at',
            fields: ['createdAt'],
         },
         {
            name: 'idx_transactions_pending',
            fields: ['status', 'createdAt'],
            where: {
               status: ['PENDING', 'CREATED'],
            },
         },
      ],
   },
);

export default Transaction;
