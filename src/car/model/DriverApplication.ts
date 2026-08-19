import { Model, DataTypes } from 'sequelize';
import sequelize from '../../../shared/config/database';
import { User } from '../../user/models/User';

export enum DriverApplicationStatus {
   PENDING = 'PENDING',
   VERIFIED = 'VERIFIED',
   REJECTED = 'REJECTED',
   FAILED_DIDOX = 'FAILED_DIDOX',
}

export interface DriverApplicationAttributes {
   id: string;
   user_id: string;

   first_name?: string;
   last_name?: string;
   middle_name?: string;

   phone?: string;

   licenseFrontPath: string;
   licensePinfl: string;
   typeOfLicence: string;
   status: DriverApplicationStatus;
}

export class DriverApplication
   extends Model<DriverApplicationAttributes>
   implements DriverApplicationAttributes
{
   public id!: string;
   public user_id!: string;

   public first_name?: string;
   public last_name?: string;
   public middle_name?: string;

   public phone?: string;

   public licenseFrontPath!: string;
   public licensePinfl!: string;
   public typeOfLicence!: string;

   public status!: DriverApplicationStatus;
}

DriverApplication.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      user_id: {
         type: DataTypes.UUID,
         field: 'user_id',
         references: {
            model: User,
            key: 'id',
         },
         unique: true,
         onDelete: 'CASCADE',
      },
      first_name: {
         type: DataTypes.STRING(32),
         allowNull: true,
         validate: {
            notEmpty: true,
            len: [1, 32],
         },
      },
      last_name: {
         type: DataTypes.STRING(32),
         allowNull: true,
         validate: {
            len: [0, 32],
         },
      },
      middle_name: {
         type: DataTypes.STRING(32),
         allowNull: true,
         validate: {
            len: [0, 32],
         },
      },
      phone: {
         type: DataTypes.STRING(13),
         allowNull: false,
         validate: {
            is: /^\+998[0-9]{9}$/,
         },
      },
      licenseFrontPath: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'license_front_path',
      },
      licensePinfl: {
         type: DataTypes.STRING(14),
         allowNull: false,
         field: 'license_pinfl',
      },
      typeOfLicence: {
         type: DataTypes.STRING(1),
         allowNull: true,
         field: 'type_of_licence',
      },
      status: {
         type: DataTypes.ENUM(...Object.values(DriverApplicationStatus)),
         allowNull: false,
         defaultValue: DriverApplicationStatus.PENDING,
      },
   },
   {
      sequelize: sequelize,
      tableName: 'driver_applications',
      modelName: 'DriverApplication',
      timestamps: true,
   },
);

export default DriverApplication;
