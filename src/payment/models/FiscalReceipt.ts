import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export interface FiscalReceiptAttributes {
   id: string;
   transactionId: string;
   ofdLink: string;
}

export type FiscalReceiptCreationAttributes = Optional<
   FiscalReceiptAttributes,
   'id'
>;

class FiscalReceipt
   extends Model<FiscalReceiptAttributes, FiscalReceiptCreationAttributes>
   implements FiscalReceiptAttributes
{
   public id!: string;
   public transactionId!: string;
   public ofdLink!: string;
   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

FiscalReceipt.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      transactionId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'transactions', key: 'id' },
         unique: true,
      },
      ofdLink: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'ofd_link',
      },
   },
   {
      sequelize: db,
      tableName: 'fiscal_receipts',
      timestamps: true,
   },
);

export default FiscalReceipt;
