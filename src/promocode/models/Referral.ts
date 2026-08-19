import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import User from '../../user/models/User';
import ReferralCode from './ReferralCode';

export enum ReferralStatus {
   PENDING = 'PENDING',
   COMPLETED = 'COMPLETED',
   CANCELLED = 'CANCELLED',
}

interface ReferralAttributes {
   id: string;
   referralCodeId: string;
   referrerId: string;
   referredUserId: string;
   status: ReferralStatus;
   createdAt?: Date;
   updatedAt?: Date;
}

export type ReferralCreationAttributes = Optional<
   ReferralAttributes,
   'id' | 'status' | 'createdAt' | 'updatedAt'
>;

class Referral
   extends Model<ReferralAttributes, ReferralCreationAttributes>
   implements ReferralAttributes
{
   public id!: string;
   public referralCodeId!: string;
   public referrerId!: string;
   public referredUserId!: string;
   public status!: ReferralStatus;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public readonly referralCode?: ReferralCode;
   public readonly referrer?: User;
   public readonly referredUser?: User;
}

Referral.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      referralCodeId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: ReferralCode, key: 'id' },
         onDelete: 'SET NULL',
         field: 'referral_code_id',
      },
      referrerId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
         onDelete: 'CASCADE',
         field: 'referrer_id',
      },
      referredUserId: {
         type: DataTypes.UUID,
         allowNull: false,
         unique: true,
         references: { model: User, key: 'id' },
         onDelete: 'CASCADE',
         field: 'referred_user_id',
      },
      status: {
         type: DataTypes.ENUM(...Object.values(ReferralStatus)),
         allowNull: false,
         defaultValue: ReferralStatus.PENDING,
      },
   },
   {
      sequelize: db,
      tableName: 'referrals',
      timestamps: true,
      indexes: [
         { fields: ['referrer_id'] },
         { unique: true, fields: ['referred_user_id'] },
      ],
   },
);

export default Referral;
