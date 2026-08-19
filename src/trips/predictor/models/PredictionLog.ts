import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../../shared/config/database';

export type PredictionOutcome =
   | 'pending'
   | 'confirmed'
   | 'expired'
   | 'cancelled';

export const PREDICTION_OUTCOMES: PredictionOutcome[] = [
   'pending',
   'confirmed',
   'expired',
   'cancelled',
];

export interface PredictionLogAttributes {
   id: string;
   pattern_id: string;
   predicted_trip: string;
   target_date: string; // DATE (YYYY-MM-DD)
   outcome: PredictionOutcome;
   confirmed_trip?: string | null;
   created_at?: Date;
   resolved_at?: Date | null;
}

export type PredictionLogCreationAttributes = Optional<
   PredictionLogAttributes,
   'id' | 'outcome' | 'confirmed_trip' | 'created_at' | 'resolved_at'
>;

export class PredictionLog
   extends Model<PredictionLogAttributes, PredictionLogCreationAttributes>
   implements PredictionLogAttributes
{
   public id!: string;
   public pattern_id!: string;
   public predicted_trip!: string;
   public target_date!: string;
   public outcome!: PredictionOutcome;
   public confirmed_trip?: string | null;

   public readonly created_at!: Date;
   public resolved_at?: Date | null;
}

PredictionLog.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      pattern_id: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'driver_patterns', key: 'id' },
      },
      predicted_trip: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: 'trips', key: 'id' },
      },
      target_date: { type: DataTypes.DATEONLY, allowNull: false },
      outcome: {
         type: DataTypes.TEXT,
         allowNull: false,
         defaultValue: 'pending',
         validate: { isIn: [PREDICTION_OUTCOMES] },
      },
      confirmed_trip: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'trips', key: 'id' },
      },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
   },
   {
      sequelize: db,
      modelName: 'PredictionLog',
      tableName: 'prediction_log',
      // created_at есть, resolved_at ручной — updated_at не нужен
      timestamps: true,
      updatedAt: false,
      underscored: true,
   },
);

export default PredictionLog;
