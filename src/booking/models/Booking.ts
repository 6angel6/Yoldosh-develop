import { Model, DataTypes } from 'sequelize';
import sequelize from '../../../shared/config/database';
import User from '../../user/models/User';
import Trip from '../../trips/models/Trip';

export enum BookingStatus {
   PENDING = 'PENDING',
   CONFIRMED = 'CONFIRMED',
   FAILED = 'FAILED',
   CANCELLED = 'CANCELLED',
   REJECTED = 'REJECTED',
}

export interface BookingAttributes {
   id: string;
   tripId: string;
   passengerId: string;
   seatsBooked: number;

   pickup_latitude: number;
   pickup_longitude: number;
   dropoff_latitude: number;
   dropoff_longitude: number;

   from_city: string;
   to_city: string;

   from_address: string;
   to_address: string;

   totalPrice: number;
   status: BookingStatus;
   cancellationReason?: string;

   createdAt?: Date;
   updatedAt?: Date;

   passenger?: User;
}

class Booking extends Model<BookingAttributes> implements BookingAttributes {
   public id!: string;
   public tripId!: string;
   public passengerId!: string;

   public pickup_latitude: number;
   public pickup_longitude: number;
   public dropoff_latitude: number;
   public dropoff_longitude: number;

   public from_city: string;
   public to_city: string;

   public from_address: string;
   public to_address: string;

   public seatsBooked!: number;
   public totalPrice!: number;
   public status!: BookingStatus;
   public cancellationReason!: string;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public passenger?: User;
}

Booking.init(
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
      },
      passengerId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: User, key: 'id' },
      },
      pickup_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'pickup_latitude',
         defaultValue: 0.0,
      },
      pickup_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'from_longitude',
         defaultValue: 0.0,
      },
      dropoff_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'dropoff_latitude',
         defaultValue: 0.0,
      },
      dropoff_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'dropoff_longitude',
         defaultValue: 0.0,
      },
      from_city: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'from_city',
         defaultValue: '',
      },
      to_city: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'to_city',
         defaultValue: '',
      },
      from_address: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'from_address',
         defaultValue: '',
      },
      to_address: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'to_address',
         defaultValue: '',
      },
      seatsBooked: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 1,
      },
      totalPrice: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
      },
      status: {
         type: DataTypes.ENUM(...Object.values(BookingStatus)),
         allowNull: false,
      },
      cancellationReason: {
         type: DataTypes.STRING(100),
         allowNull: true,
         validate: {
            len: [0, 100],
         },
      },
   },
   {
      sequelize,
      modelName: 'Booking',
      tableName: 'bookings',
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
      indexes: [
         {
            name: 'idx_bookings_trip_status',
            fields: ['tripId', 'status'],
         },
         {
            name: 'idx_bookings_passenger',
            fields: ['passengerId', 'createdAt'],
         },
         // Композитный для подсчёта активных бронирований
         {
            name: 'idx_bookings_trip_active',
            fields: ['tripId', 'status'],
            where: {
               status: 'CONFIRMED',
            },
         },
         {
            name: 'idx_bookings_status',
            fields: ['status'],
         },
         // Композитный индекс для предотвращения дубликатов и быстрого поиска
         {
            name: 'idx_bookings_trip_passenger',
            fields: ['tripId', 'passengerId'],
         },
         {
            name: 'idx_bookings_created_at',
            fields: ['createdAt'],
         },
      ],
   },
);

export default Booking;
