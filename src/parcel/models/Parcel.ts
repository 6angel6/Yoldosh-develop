import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import User from '../../user/models/User';

/**
 * Посылки (MVP). Максимально просто, как в Яндекс Доставке: о посылке
 * ничего не известно — только точка А (забор) и точка Б (выдача).
 *
 * Флоу как у брони — по booking_type трипа:
 *   INSTANT → сразу CONFIRMED, REQUEST → PENDING (водитель подтверждает).
 *   CONFIRMED → PICKED_UP (забрал) → DELIVERED (отдал)
 *   ↘ REJECTED (водитель)  ↘ CANCELLED (отправитель / отмена трипа)
 *
 * Места (seats_available) посылка НЕ занимает.
 */
export enum ParcelStatus {
   PENDING = 'PENDING',
   CONFIRMED = 'CONFIRMED',
   REJECTED = 'REJECTED',
   CANCELLED = 'CANCELLED',
   PICKED_UP = 'PICKED_UP',
   DELIVERED = 'DELIVERED',
}

export interface ParcelAttributes {
   id: string;
   trip_id: string;
   sender_id: string;

   // pickup — где водитель забирает посылку, dropoff — где отдаёт получателю
   pickup_latitude: number;
   pickup_longitude: number;
   dropoff_latitude: number;
   dropoff_longitude: number;

   from_city: string;
   to_city: string;
   from_address: string;
   to_address: string;

   price: number;
   status: ParcelStatus;
   cancellation_reason?: string | null;

   created_at?: Date;
   updated_at?: Date;

   sender?: User;
}

export interface ParcelCreationAttributes
   extends Optional<
      ParcelAttributes,
      'id' | 'status' | 'cancellation_reason' | 'created_at' | 'updated_at'
   > {}

export class Parcel
   extends Model<ParcelAttributes, ParcelCreationAttributes>
   implements ParcelAttributes
{
   public id!: string;
   public trip_id!: string;
   public sender_id!: string;

   public pickup_latitude!: number;
   public pickup_longitude!: number;
   public dropoff_latitude!: number;
   public dropoff_longitude!: number;

   public from_city!: string;
   public to_city!: string;
   public from_address!: string;
   public to_address!: string;

   public price!: number;
   public status!: ParcelStatus;
   public cancellation_reason?: string | null;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;

   public sender?: User;
}

Parcel.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      trip_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'trips', key: 'id' },
         onDelete: 'CASCADE',
      },
      sender_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'users', key: 'id' },
      },
      pickup_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
      },
      pickup_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
      },
      dropoff_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
      },
      dropoff_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
      },
      from_city: {
         type: DataTypes.STRING,
         allowNull: false,
         defaultValue: '',
      },
      to_city: {
         type: DataTypes.STRING,
         allowNull: false,
         defaultValue: '',
      },
      from_address: {
         type: DataTypes.STRING,
         allowNull: false,
         defaultValue: '',
      },
      to_address: {
         type: DataTypes.STRING,
         allowNull: false,
         defaultValue: '',
      },
      price: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
         validate: {
            min: 0,
         },
      },
      status: {
         type: DataTypes.ENUM(...Object.values(ParcelStatus)),
         allowNull: false,
         defaultValue: ParcelStatus.PENDING,
      },
      cancellation_reason: {
         type: DataTypes.STRING(100),
         allowNull: true,
      },
   },
   {
      sequelize: db,
      modelName: 'Parcel',
      tableName: 'parcels',
      timestamps: true,
      paranoid: true,
      underscored: true,
      indexes: [
         {
            name: 'idx_parcels_trip_status',
            fields: ['trip_id', 'status'],
         },
         {
            name: 'idx_parcels_sender_created',
            fields: ['sender_id', 'created_at'],
         },
      ],
   },
);

export default Parcel;
