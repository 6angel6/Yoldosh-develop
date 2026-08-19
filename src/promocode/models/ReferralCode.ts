import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import User from '../../user/models/User';

interface ReferralCodeAttributes {
   id: string;
   userId: string;
   code: string;
   isActive: boolean;
   createdAt?: Date;
   updatedAt?: Date;
}

export type ReferralCodeCreationAttributes = Optional<
   ReferralCodeAttributes,
   'id' | 'isActive' | 'createdAt' | 'updatedAt'
>;

class ReferralCode
   extends Model<ReferralCodeAttributes, ReferralCodeCreationAttributes>
   implements ReferralCodeAttributes
{
   public id!: string;
   public userId!: string;
   public code!: string;
   public isActive!: boolean;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public readonly user?: User;
}

ReferralCode.init(
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
         references: { model: User, key: 'id' },
         onDelete: 'CASCADE',
         field: 'user_id',
      },
      code: {
         type: DataTypes.STRING,
         allowNull: false,
         unique: true,
      },
      isActive: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: true,
         field: 'is_active',
      },
   },
   {
      sequelize: db,
      tableName: 'referral_codes',
      timestamps: true,
      indexes: [
         { unique: true, fields: ['code'] },
         { unique: true, fields: ['user_id'] },
      ],
   },
);

export default ReferralCode;
