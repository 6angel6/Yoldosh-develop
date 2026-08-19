import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum UserBlockStatus {
   BLOCKED = 'BLOCKED',
   UNBLOCKED = 'UNBLOCKED',
}

export interface UserBlockAttributes {
   id: string;

   blocker_id: string;
   blocked_id: string;
   status?: UserBlockStatus;

   created_at?: Date;
   updated_at?: Date;
}

export type UserBlockCreateionAttributes = Optional<UserBlockAttributes, 'id'>;

class UserBlocks
   extends Model<UserBlockAttributes, UserBlockCreateionAttributes>
   implements UserBlockAttributes
{
   public id!: string;
   public blocker_id!: string;
   public blocked_id!: string;
   public status!: UserBlockStatus;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;
}

UserBlocks.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      blocker_id: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'users', key: 'id' },
         onDelete: 'CASCADE',
         field: 'blocker_id',
      },
      blocked_id: {
         type: DataTypes.UUID,
         references: { model: 'users', key: 'id' },
         allowNull: true,
         field: 'blocked_id',
      },
      status: {
         type: DataTypes.ENUM(...Object.values(UserBlockStatus)),
         allowNull: true,
         field: 'status',
      },
   },
   {
      sequelize: db,
      tableName: 'user_blocks',
      timestamps: true,
      underscored: true,
   },
);

export default UserBlocks;
