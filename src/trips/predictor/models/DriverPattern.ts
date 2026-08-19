import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../../shared/config/database';

export type PatternStatus = 'candidate' | 'active' | 'decaying' | 'inactive';

export const PATTERN_STATUSES: PatternStatus[] = [
   'candidate',
   'active',
   'decaying',
   'inactive',
];

export interface DriverPatternAttributes {
   id: string;
   driver_id: string;
   from_city_id: string;
   to_city_id: string;

   // Минуты от полуночи UZT (0..1439). Последнее наблюдённое время выезда
   // (как прислал парсер) — на него ставятся прогнозы.
   departure_time: number;
   time_tolerance: number;
   // Последние N времён выезда (мин. UZT) — для оценки стабильности (stddev) в
   // строгом режиме MATCH_BY_TIME. Длина ограничена RECENT_TIMES_CAP.
   recent_departure_min: number[];

   price?: number | null;
   seats?: number | null;
   car_id?: string | null;
   comment?: string | null;

   days_of_week?: number[] | null; // [Этап 2] [1..7]

   occurrences: number; // lifetime, для метрик
   window_occurrences: number; // в окне WINDOW_DAYS, решает активацию
   first_seen: string; // DATE (YYYY-MM-DD)
   last_seen: string; // DATE (YYYY-MM-DD)
   confidence: number; // 0..1
   status: PatternStatus;

   created_at?: Date;
   updated_at?: Date;
}

export type DriverPatternCreationAttributes = Optional<
   DriverPatternAttributes,
   | 'id'
   | 'time_tolerance'
   | 'recent_departure_min'
   | 'price'
   | 'seats'
   | 'car_id'
   | 'comment'
   | 'days_of_week'
   | 'occurrences'
   | 'window_occurrences'
   | 'confidence'
   | 'status'
   | 'created_at'
   | 'updated_at'
>;

export class DriverPattern
   extends Model<DriverPatternAttributes, DriverPatternCreationAttributes>
   implements DriverPatternAttributes
{
   public id!: string;
   public driver_id!: string;
   public from_city_id!: string;
   public to_city_id!: string;

   public departure_time!: number;
   public time_tolerance!: number;
   public recent_departure_min!: number[];

   public price?: number | null;
   public seats?: number | null;
   public car_id?: string | null;
   public comment?: string | null;

   public days_of_week?: number[] | null;

   public occurrences!: number;
   public window_occurrences!: number;
   public first_seen!: string;
   public last_seen!: string;
   public confidence!: number;
   public status!: PatternStatus;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;
}

DriverPattern.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      driver_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'users', key: 'id' },
      },
      from_city_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'cities', key: 'id' },
      },
      to_city_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'cities', key: 'id' },
      },
      departure_time: {
         type: DataTypes.SMALLINT,
         allowNull: false,
      },
      time_tolerance: {
         type: DataTypes.SMALLINT,
         allowNull: false,
         defaultValue: 30,
      },
      recent_departure_min: {
         type: DataTypes.ARRAY(DataTypes.SMALLINT),
         allowNull: false,
         defaultValue: [],
      },
      price: { type: DataTypes.INTEGER, allowNull: true },
      seats: { type: DataTypes.SMALLINT, allowNull: true },
      car_id: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'cars', key: 'id' },
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
      days_of_week: {
         type: DataTypes.ARRAY(DataTypes.SMALLINT),
         allowNull: true,
      },
      occurrences: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 1,
      },
      window_occurrences: {
         type: DataTypes.SMALLINT,
         allowNull: false,
         defaultValue: 1,
      },
      first_seen: { type: DataTypes.DATEONLY, allowNull: false },
      last_seen: { type: DataTypes.DATEONLY, allowNull: false },
      confidence: {
         type: DataTypes.DECIMAL(4, 3),
         allowNull: false,
         defaultValue: 0,
      },
      status: {
         type: DataTypes.TEXT,
         allowNull: false,
         defaultValue: 'candidate',
         validate: { isIn: [PATTERN_STATUSES] },
      },
   },
   {
      sequelize: db,
      modelName: 'DriverPattern',
      tableName: 'driver_patterns',
      timestamps: true,
      underscored: true,
   },
);

export default DriverPattern;
