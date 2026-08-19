import { DataTypes, Model, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum ReportStatus {
   PENDING = 'PENDING',
   RESOLVED = 'RESOLVED',
   REJECTED = 'REJECTED',
}

export interface ReportAttributes {
   id: string;
   userId: string;
   reportedUserId?: string;
   tripId?: string;
   reason: string;
   status: ReportStatus;
   createdAt?: Date;
   updatedAt?: Date;
}

export type ReportCreationAttributes = Optional<
   ReportAttributes,
   'id' | 'status' | 'createdAt' | 'updatedAt'
>;

export class Report
   extends Model<ReportAttributes, ReportCreationAttributes>
   implements ReportAttributes
{
   public id!: string;
   public userId!: string;
   public reportedUserId!: string;
   public tripId!: string;
   public reason!: string;
   public status!: ReportStatus;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Report.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      userId: {
         // WHO filed the complaint
         type: DataTypes.UUID,
         allowNull: false,
         references: {
            model: 'users',
            key: 'id',
         },
      },
      reportedUserId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: {
            model: 'users',
            key: 'id',
         },
      },
      tripId: {
         type: DataTypes.UUID,
         allowNull: true,
         references: {
            model: 'trips',
            key: 'id',
         },
      },
      reason: {
         type: DataTypes.TEXT,
         allowNull: false,
      },
      status: {
         type: DataTypes.ENUM(...Object.values(ReportStatus)),
         allowNull: false,
         defaultValue: ReportStatus.PENDING,
      },
   },
   {
      sequelize: db,
      modelName: 'Report',
      tableName: 'reports',
      timestamps: true,
      indexes: [{ fields: ['userId'] }, { fields: ['reportedUserId'] }],
   },
);

export default Report;
