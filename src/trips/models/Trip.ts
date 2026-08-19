import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';
import Booking from '../../booking/models/Booking';
import Car from '../../car/model/Car';
import User from '../../user/models/User';

export enum TripStatus {
   Created = 'CREATED',
   InProgress = 'IN_PROGRESS',
   Completed = 'COMPLETED',
   Canceled = 'CANCELED',
}

export enum BookingType {
   instant = 'INSTANT',
   request = 'REQUEST',
}

export enum GarageStatus {
   Full = 'FULL',
   Empty = 'EMPTY',
   HalfEmpty = 'HALF_EMPTY',
}

export interface TripAttributes {
   id: string;
   driver_id: string;
   car_id: string;

   from_city: string;
   to_city: string;

   // FK на cities — первичный ключ матчинга в новом поиске (Волна 1 exact)
   from_city_id?: string | null;
   to_city_id?: string | null;

   from_latitude: number;
   from_longitude: number;
   to_latitude: number;
   to_longitude: number;

   from_geo?: any; // geography(Point, 4326) - для правильных расстояний в метрах
   to_geo?: any; // geography(Point, 4326) - для правильных расстояний в метрах
   route_geo?: any; // geography(LINESTRING, 4326) - коридор для транзитного поиска

   from_address: string;
   to_address: string;

   distance?: number;
   duration?: number;

   booking_type: BookingType;

   departure_ts: Date;
   arrival_ts?: Date;
   seats_available: number;
   price_per_person: number;
   max_two_back: boolean;

   conditioner?: boolean;
   smoking_allowed?: boolean;
   door_pickup?: boolean;
   food_stop?: boolean;
   garage?: GarageStatus;

   // --- Посылки (MVP) ---
   parcels_allowed?: boolean; // водитель готов перевозить посылки этим трипом
   parcel_price?: number | null; // цена за посылку; NULL → price_per_person

   comment?: string;
   status: TripStatus;
   created_at?: Date;
   updated_at?: Date;
   trip_start_ts?: Date;
   trip_end_ts?: Date;

   driver?: User;
   car?: Car;
   bookings?: Booking[];

   // --- Trip Predictor (Этап 1) ---
   is_predicted?: boolean; // прогнозный трип (копия регулярного паттерна)
   source_trip_id?: string | null; // реальный трип-источник
   pattern_id?: string | null; // ссылка на driver_patterns
   prediction_confidence?: number | null; // 0..1 на момент генерации
   predicted_at?: Date | null;
}

export interface TripCreationAttributes
   extends Optional<
      TripAttributes,
      | 'id'
      | 'created_at'
      | 'updated_at'
      | 'trip_start_ts'
      | 'trip_end_ts'
      | 'status'
      | 'is_predicted'
      | 'source_trip_id'
      | 'pattern_id'
      | 'prediction_confidence'
      | 'predicted_at'
   > {}

export class Trip
   extends Model<TripAttributes, TripCreationAttributes>
   implements TripAttributes
{
   public id!: string;
   public driver_id!: string;
   public car_id!: string;

   public from_city: string;
   public to_city: string;

   public from_city_id?: string | null;
   public to_city_id?: string | null;

   public from_latitude!: number;
   public from_longitude!: number;
   public to_latitude!: number;
   public to_longitude!: number;

   public from_geo?: any; // PostGIS geography - расстояния в метрах
   public to_geo?: any; // PostGIS geography - расстояния в метрах
   public route_geo?: any; // PostGIS geography(LINESTRING) — коридор маршрута

   public from_address!: string;
   public to_address!: string;

   public distance: number;
   public duration: number;

   public booking_type!: BookingType;

   public departure_ts!: Date;
   public arrival_ts?: Date;

   public seats_available!: number;
   public price_per_person!: number;
   public max_two_back!: boolean;

   public conditioner?: boolean;
   public smoking_allowed?: boolean;
   public door_pickup?: boolean;
   public food_stop?: boolean;
   public garage?: GarageStatus;

   // --- Посылки (MVP) ---
   public parcels_allowed?: boolean;
   public parcel_price?: number | null;

   public comment?: string;
   public trip_start_ts?: Date;
   public trip_end_ts?: Date;
   public status!: TripStatus;

   // --- Trip Predictor (Этап 1) ---
   public is_predicted?: boolean;
   public source_trip_id?: string | null;
   public pattern_id?: string | null;
   public prediction_confidence?: number | null;
   public predicted_at?: Date | null;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;
}

Trip.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      driver_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: {
            model: 'users',
            key: 'id',
         },
      },
      car_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: {
            model: 'cars',
            key: 'id',
         },
         onDelete: 'CASCADE',
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
      from_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'from_latitude',
      },
      from_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'from_longitude',
      },
      to_latitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'to_latitude',
      },
      to_longitude: {
         type: DataTypes.DECIMAL(9, 6),
         allowNull: false,
         field: 'to_longitude',
      },
      from_geo: {
         type: DataTypes.GEOGRAPHY('POINT', 4326),
         allowNull: true,
         field: 'from_geo',
      },
      to_geo: {
         type: DataTypes.GEOGRAPHY('POINT', 4326),
         allowNull: true,
         field: 'to_geo',
      },
      route_geo: {
         type: DataTypes.GEOGRAPHY('LINESTRING', 4326),
         allowNull: true,
         field: 'route_geo',
      },
      from_city_id: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'from_city_id',
         references: { model: 'cities', key: 'id' },
      },
      to_city_id: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'to_city_id',
         references: { model: 'cities', key: 'id' },
      },
      distance: {
         type: DataTypes.INTEGER,
         allowNull: true,
         field: 'distance',
      },
      duration: {
         type: DataTypes.INTEGER,
         allowNull: true,
         field: 'duration',
      },
      from_address: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'from_address',
      },
      to_address: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'to_address',
      },
      booking_type: {
         type: DataTypes.ENUM(...Object.values(BookingType)),
         allowNull: false,
         defaultValue: BookingType.instant,
      },
      departure_ts: {
         type: DataTypes.DATE,
         allowNull: false,
      },
      arrival_ts: {
         type: DataTypes.DATE,
         allowNull: true,
         field: 'arrival_ts',
      },
      seats_available: {
         type: DataTypes.INTEGER,
         allowNull: false,
         validate: {
            min: 0,
         },
      },
      price_per_person: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: false,
         validate: {
            min: 0,
         },
      },
      max_two_back: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
       conditioner: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      smoking_allowed: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      door_pickup: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      food_stop: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      garage: {
         type: DataTypes.ENUM(...Object.values(GarageStatus)),
         allowNull: false,
         defaultValue: GarageStatus.Empty,
      },
      parcels_allowed: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      parcel_price: {
         type: DataTypes.DECIMAL(10, 2),
         allowNull: true,
         validate: {
            min: 0,
         },
      },
      comment: {
         type: DataTypes.STRING(255),
         allowNull: true,
      },
      status: {
         type: DataTypes.ENUM(...Object.values(TripStatus)),
         allowNull: false,
         defaultValue: TripStatus.Created,
      },
      trip_start_ts: {
         type: DataTypes.DATE,
         allowNull: true,
      },
      trip_end_ts: {
         type: DataTypes.DATE,
         allowNull: true,
      },
      // --- Trip Predictor (Этап 1) ---
      is_predicted: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
      },
      source_trip_id: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'trips', key: 'id' },
      },
      pattern_id: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'driver_patterns', key: 'id' },
      },
      prediction_confidence: {
         type: DataTypes.DECIMAL(4, 3),
         allowNull: true,
      },
      predicted_at: {
         type: DataTypes.DATE,
         allowNull: true,
      },
   },
   {
      sequelize: db,
      modelName: 'Trip',
      tableName: 'trips',
      timestamps: true,
      paranoid: true,
      underscored: true,
      defaultScope: {
         attributes: {
            exclude: ['from_geo', 'to_geo', 'route_geo'],
         },
      },
      indexes: [
         {
            name: 'idx_trips_driver_id',
            fields: ['driver_id'],
         },
         {
            name: 'idx_trips_departure_ts',
            fields: ['departure_ts'],
         },
         {
            name: 'idx_trips_car_id',
            fields: ['car_id'],
         },
         // Partial composite index для поиска поездок по статусу и дате
         // WHERE status IN (...) уменьшает размер индекса — hotpath для searchTrips
         {
            name: 'idx_trips_status_departure',
            fields: ['status', 'departure_ts'],
            where: {
               status: ['CREATED', 'IN_PROGRESS'],
            },
         },
         {
            name: 'idx_trips_cities_departure',
            fields: ['from_city', 'to_city', 'departure_ts'],
         },
         // Partial index для активных поездок (высокочастотные запросы)
         {
            name: 'idx_trips_active',
            fields: ['status', 'driver_id', 'departure_ts'],
            where: {
               status: ['CREATED', 'IN_PROGRESS'],
            },
         },
         {
            name: 'idx_trips_driver_status',
            fields: ['driver_id', 'status'],
         },
         {
            name: 'idx_trips_car_active',
            fields: ['car_id', 'status'],
            where: {
               status: ['CREATED', 'IN_PROGRESS'],
            },
         },
         {
            name: 'idx_trips_created_at',
            fields: ['created_at'],
         },
         // PostGIS GiST индексы для геопространственных запросов
         {
            name: 'idx_trips_from_geo_gist',
            using: 'GIST',
            fields: ['from_geo'],
         },
         {
            name: 'idx_trips_to_geo_gist',
            using: 'GIST',
            fields: ['to_geo'],
         },
      ],
   },
);

export default Trip;
