import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import User from '../../user/models/User';
import Trip from '../../trips/models/Trip';

export interface RatingAttributes {
   id: string;
   tripId: string;
   ratingById: string; // User who is rating
   ratedUserId: string; // User who is being rated
   rating: number;
   feedback?: string;
}

export interface RatingCreationAttributes
   extends Optional<RatingAttributes, 'id'> {}

class Rating
   extends Model<RatingAttributes, RatingCreationAttributes>
   implements RatingAttributes
{
   public id!: string;
   public tripId!: string;
   public ratingById!: string;
   public ratedUserId!: string;
   public rating!: number;
   public feedback?: string;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Rating.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      tripId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: Trip, key: 'id' },
         onDelete: 'CASCADE',
         field: 'trip_id',
      },
      ratingById: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
         field: 'rating_by_id',
      },
      ratedUserId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
         field: 'rated_user_id',
      },
      rating: {
         type: DataTypes.DECIMAL(2, 1),
         allowNull: false,
         validate: {
            min: 1,
            max: 5,
         },
      },
      feedback: {
         type: DataTypes.TEXT,
         allowNull: true,
      },
   },
   {
      sequelize: db,
      tableName: 'ratings',
      timestamps: true,
      indexes: [
         {
            unique: true,
            fields: ['trip_id', 'rating_by_id', 'rated_user_id'],
            name: 'unique_rating_constraint',
         },
      ],
   },
);

export default Rating;
