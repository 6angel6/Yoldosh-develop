import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum CardType {
   NONE = 'NONE',
   HUMO = 'HUMO',
   UZCARD = 'UZCARD',
}

export interface UserCardAttributes {
   id: string;
   userId: string;
   contractId: string;
   cardNumber: string;
   expiry: string;
   cardType: CardType;
}

export interface UserCardCreationAttributes
   extends Optional<UserCardAttributes, 'id'> {}

class UserCard
   extends Model<UserCardAttributes, UserCardCreationAttributes>
   implements UserCardAttributes
{
   public id!: string;
   public userId!: string;
   public cardNumber: string;
   public contractId!: string;
   public expiry!: string;
   public cardType: CardType;
}

UserCard.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      userId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'users', key: 'id' },
         field: 'user_id',
      },
      contractId: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'contract_id',
      },
      cardNumber: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'card_number',
         defaultValue: '',
      },
      expiry: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'expiry',
         defaultValue: '',
      },
      cardType: {
         type: DataTypes.ENUM(...Object.values(CardType)),
         allowNull: false,
         field: 'card_type',
         defaultValue: CardType.NONE,
      },
   },
   {
      sequelize: db,
      tableName: 'user_cards',
      timestamps: true,
      underscored: true,
   },
);

export default UserCard;
