import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum CurrencyType {
   UZS = 'UZS',
   USD = 'USD',
   RUB = 'RUB',
}

export interface WalletAttributes {
   id: string;
   userId: string;
   balance: number;
   currency: CurrencyType;
}

export interface WalletCreationAttributes
   extends Optional<WalletAttributes, 'id' | 'balance'> {}

class Wallet
   extends Model<WalletAttributes, WalletCreationAttributes>
   implements WalletAttributes
{
   public id!: string;
   public userId!: string;
   public balance!: number;
   public currency!: CurrencyType;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Wallet.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      userId: {
         type: DataTypes.UUID,
         allowNull: false,
         unique: true,
         references: { model: 'users', key: 'id' },
         field: 'user_id',
         onDelete: 'CASCADE',
      },
      balance: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
         defaultValue: 0,
      },
      currency: {
         type: DataTypes.ENUM(...Object.values(CurrencyType)),
         allowNull: false,
         defaultValue: CurrencyType.UZS,
      },
   },
   {
      sequelize: db,
      tableName: 'wallets',
      timestamps: true,
   },
);

export default Wallet;
