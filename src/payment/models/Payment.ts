import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import Transaction from './Transaction';

export enum PaymentProvider {
   OCTO = 'OCTO',
   CLICK = 'CLICK',
   PAYME = 'PAYME',
   PLUM = 'PLUM',
   PAYNET = 'PAYNET',
   IPAK = 'IPAK',
   NONE = 'NONE',
}

export enum PaymentStatus {
   SUCCESS = 'SUCCESS',
   PENDING = 'PENDING',
   CREATED = 'CREATED',
   FAILED = 'FAILED',
   REVERSED = 'REVERSED',
}

export interface PaymentAttributes {
   id: string;
   transactionId: string;
   provider: PaymentProvider;
   providerTransactionId: string;
   userCardId?: string;
   status: PaymentStatus;
   amount: number;

   rawResponse?: object;

   createdAt?: Date;
   updatedAt?: Date;
}

interface PaymentInstance extends PaymentAttributes {
   transaction?: Transaction;
}

export interface PaymentCreationAttributes
   extends Optional<PaymentAttributes, 'id'> {}

class Payment
   extends Model<PaymentAttributes, PaymentCreationAttributes>
   implements PaymentAttributes
{
   public id!: string;
   public transactionId!: string;
   public provider!: PaymentProvider;
   public providerTransactionId!: string;
   public status!: PaymentStatus;
   public amount!: number;
   public userCardId?: string;
   public rawResponse?: object;

   public transaction?: Transaction;
}

Payment.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      transactionId: {
         type: DataTypes.UUID,
         allowNull: false,
         unique: true,
         references: { model: 'transactions', key: 'id' },
         field: 'transaction_id',
      },
      provider: {
         type: DataTypes.ENUM(...Object.values(PaymentProvider)),
         allowNull: false,
         defaultValue: PaymentProvider.NONE,
      },
      providerTransactionId: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'provider_transaction_id',
      },
      userCardId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'user_cards', key: 'id' },
         field: 'user_card_id',
      },
      status: {
         type: DataTypes.ENUM(...Object.values(PaymentStatus)),
         allowNull: false,
         defaultValue: PaymentStatus.CREATED,
      },
      amount: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
      },
      rawResponse: {
         type: DataTypes.JSONB,
         allowNull: true,
         field: 'raw_response',
      },
   },
   {
      sequelize: db,
      tableName: 'payments',
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
      indexes: [
         // Unique индекс на transactionId (уже есть unique: true в поле)
         {
            unique: true,
            name: 'idx_payments_transaction_unique',
            fields: ['transaction_id'],
         },
         {
            name: 'idx_payments_provider_status',
            fields: ['provider', 'status'],
         },
         {
            name: 'idx_payments_user_card',
            fields: ['user_card_id'],
         },
         {
            name: 'idx_payments_provider_trans_id',
            fields: ['provider_transaction_id'],
         },
         {
            name: 'idx_payments_provider_created',
            fields: ['provider', 'createdAt'],
         },
         {
            name: 'idx_payments_status',
            fields: ['status'],
         },
      ],
   },
);

export default Payment;
