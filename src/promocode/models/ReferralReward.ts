import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

interface ReferralRewardAttributes {
   id: string;
   rewardAmount: number;
   isActive: boolean;
   createdAt?: Date;
   updatedAt?: Date;
}

export type ReferralRewardCreationAttributes = Optional<
   ReferralRewardAttributes,
   'id' | 'isActive' | 'createdAt' | 'updatedAt'
>;

class ReferralReward
   extends Model<ReferralRewardAttributes, ReferralRewardCreationAttributes>
   implements ReferralRewardAttributes
{
   public id!: string;
   public rewardAmount!: number;
   public isActive!: boolean;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

ReferralReward.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      rewardAmount: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
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
      tableName: 'referral_rewards',
      timestamps: true,
   },
);

export default ReferralReward;
