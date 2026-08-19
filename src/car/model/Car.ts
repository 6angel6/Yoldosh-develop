import User from '../../user/models/User';
import sequelize from '../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';

export enum CarStatus {
   WAITING_FOR_DIDOX = 'WAITING_FOR_DIDOX',
   PENDING = 'PENDING',
   VERIFIED = 'VERIFIED',
   REJECTED = 'REJECTED',
}

export interface CarAttributes {
   id: string;
   driver_id: string;
   rejectionReason?: string | null;

   techPassportFrontPath: string;
   techPassportBackPath: string;

   // driver license (денормализованная копия из driver_applications)
   licenseFrontPath?: string | null;
   licensePinfl?: string | null;
   typeOfLicence?: string | null;

   govNumber?: string;
   make?: string;
   model?: string;
   color?: string;

   techPassportSerial?: string;
   issueDate?: Date;
   seats?: number;

   status: CarStatus;

   createdAt?: Date;
   updatedAt?: Date;
}

export type CarCreationAttributes = Optional<
   CarAttributes,
   | 'id'
   | 'rejectionReason'
   | 'licenseFrontPath'
   | 'licensePinfl'
   | 'typeOfLicence'
   | 'createdAt'
   | 'updatedAt'
>;

export class Car
   extends Model<CarAttributes, CarCreationAttributes>
   implements CarAttributes
{
   public id!: string;
   public driver_id!: string;
   public rejectionReason?: string | null;

   public techPassportFrontPath!: string;
   public techPassportBackPath!: string;

   public licenseFrontPath?: string | null;
   public licensePinfl?: string | null;
   public typeOfLicence?: string | null;

   public govNumber?: string;
   public make?: string;
   public model?: string;
   public color?: string;

   public techPassportSerial?: string;
   public issueDate?: Date;
   public seats?: number;

   public status: CarStatus;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public readonly driver?: User;
}

Car.init(
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
         onDelete: 'CASCADE',
      },
      techPassportFrontPath: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'tech_passport_front_path',
      },
      techPassportBackPath: {
         type: DataTypes.STRING,
         allowNull: false,
         field: 'tech_passport_back_path',
      },
      // driver license (mirror of driver_applications)
      licenseFrontPath: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'license_front_path',
      },
      licensePinfl: {
         type: DataTypes.STRING(14),
         allowNull: true,
         field: 'license_pinfl',
      },
      typeOfLicence: {
         type: DataTypes.STRING(1),
         allowNull: true,
         field: 'type_of_licence',
      },
      govNumber: {
         type: DataTypes.STRING(15),
         allowNull: true,
         field: 'gov_number',
      },
      make: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'make',
      },
      model: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'model',
      },
      color: {
         type: DataTypes.STRING,
         allowNull: true,
      },
      techPassportSerial: {
         type: DataTypes.STRING(10),
         allowNull: true,
         field: 'tech_passport_serial',
      },

      issueDate: {
         type: DataTypes.DATEONLY,
         allowNull: true,
         field: 'issue_date',
      },
      seats: {
         type: DataTypes.INTEGER,
         allowNull: true,
      },
      status: {
         type: DataTypes.ENUM(...Object.values(CarStatus)),
         allowNull: false,
         defaultValue: CarStatus.PENDING,
      },
      rejectionReason: {
         type: DataTypes.TEXT,
         allowNull: true,
         field: 'rejection_reason',
      },
   },

   {
      sequelize,
      modelName: 'Car',
      tableName: 'cars',
      timestamps: true,
      indexes: [
         {
            unique: true,
            fields: ['driver_id', 'gov_number'],
         },
      ],
   },
);

export default Car;
