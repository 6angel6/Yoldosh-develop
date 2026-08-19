import db from '../../../shared/config/database';
import User from '../../user/models/User';
import { Model, DataTypes, Optional, Op } from 'sequelize';

export enum PromoCodeType {
   SINGLE_USER = 'SINGLE_USER',
   GLOBAL = 'GLOBAL',
}

export interface PromoCodeAttributes {
   id: string;
   code: string;
   discountPercentage: number;
   expiresAt?: Date | null;
   isActive: boolean;
   type: PromoCodeType;
   userId?: string | null;
   useAmount?: number | null;
}

export type PromoCodeCreationAttributes = Optional<
   PromoCodeAttributes,
   'id' | 'isActive'
>;

class PromoCode
   extends Model<PromoCodeAttributes, PromoCodeCreationAttributes>
   implements PromoCodeAttributes
{
   public id!: string;
   public code!: string;
   public discountPercentage!: number;
   public expiresAt!: Date | null;
   public isActive!: boolean;
   public type!: PromoCodeType;
   public userId!: string | null;
   public useAmount!: number | null;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

PromoCode.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      code: {
         type: DataTypes.STRING,
         allowNull: false,
         unique: true,
      },
      discountPercentage: {
         type: DataTypes.INTEGER,
         allowNull: false,
         field: 'discount_percentage',
         validate: {
            min: 1,
            max: 100,
         },
      },
      expiresAt: {
         type: DataTypes.DATE,
         allowNull: true,
         field: 'expires_at',
      },
      isActive: {
         type: DataTypes.BOOLEAN,
         defaultValue: true,
         field: 'is_active',
      },
      type: {
         type: DataTypes.ENUM(...Object.values(PromoCodeType)),
         allowNull: false,
         defaultValue: PromoCodeType.SINGLE_USER,
      },
      userId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: User, key: 'id' },
         onDelete: 'CASCADE',
         field: 'user_id',
      },
      useAmount: {
         type: DataTypes.INTEGER,
         allowNull: true,
         field: 'use_amount',
      },
   },
   {
      sequelize: db,
      tableName: 'promo_codes',
      timestamps: true,
      indexes: [
         {
            unique: true,
            fields: ['user_id'],
            where: {
               type: PromoCodeType.SINGLE_USER,
               user_id: {
                  [Op.ne]: null,
               },
            },
         },
      ],
   },
);

export default PromoCode;
