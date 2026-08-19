import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export interface SearchAttributes {
   id: string;
   userId?: string;
   guestId?: string;

   from_city?: string;
   to_city?: string;

   from_address?: string;
   to_address?: string;

   created_at?: Date;
   updated_at?: Date;
}

export type SearchCreationAttributes = Optional<SearchAttributes, 'id'>;

class Search
   extends Model<SearchAttributes, SearchCreationAttributes>
   implements SearchAttributes
{
   public id!: string;
   public userId!: string | null;
   public guestId!: string | null;

   public from_city: string;
   public to_city: string;

   public from_address!: string | null;
   public to_address!: string | null;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;
}

Search.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      userId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'users', key: 'id' },
         onDelete: 'CASCADE',
         field: 'userId',
      },
      guestId: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'guest_id',
      },
      from_city: {
         type: DataTypes.STRING(255),
         allowNull: true,
         field: 'from_city',
      },
      to_city: {
         type: DataTypes.STRING(255),
         allowNull: true,
         field: 'to_city',
      },
      from_address: {
         type: DataTypes.STRING(255),
         allowNull: false,
         field: 'from_address',
      },
      to_address: {
         type: DataTypes.STRING(255),
         allowNull: false,
         field: 'to_address',
      },
   },
   {
      sequelize: db,
      tableName: 'searches',
      timestamps: true,
      underscored: true,
   },
);

export default Search;
