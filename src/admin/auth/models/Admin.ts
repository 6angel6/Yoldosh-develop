import bcrypt from 'bcrypt';
import db from '../../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';

export enum AdminRole {
   Admin = 'Admin',
   SuperAdmin = 'SuperAdmin',
}

export enum AdminPermission {
   DRIVER_APPLICATIONS = 'driver_applications',
   REPORTS = 'reports',
   TRIPS = 'trips',
   BOOKINGS = 'bookings',
   NOTIFICATIONS = 'notifications',
   PROMOCODES = 'promocodes',
   MODERATION = 'moderation',
   BLOGS = 'blogs',
   USERS = 'users',
}
export interface AdminAttributes {
   id: string;
   email: string;
   password?: string;
   firstName: string;
   lastName: string;
   role: AdminRole;
   permissions: { [key in AdminPermission]?: boolean };
   createdAt?: Date;
   updatedAt?: Date;
}

export type AdminCreationAttributes = Optional<
   AdminAttributes,
   'id' | 'createdAt' | 'updatedAt' | 'role' | 'permissions'
>;

class Admin
   extends Model<AdminAttributes, AdminCreationAttributes>
   implements AdminAttributes
{
   public id!: string;
   public email!: string;
   public password!: string;
   public firstName!: string;
   public lastName!: string;
   public role!: AdminRole;
   public permissions!: { [key in AdminPermission]?: boolean };

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public async comparePassword(password: string): Promise<boolean> {
      if (!this.password) return false;
      return bcrypt.compare(password, this.password);
   }
}

Admin.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      email: {
         type: DataTypes.STRING,
         allowNull: false,
         unique: true,
         validate: {
            isEmail: true,
            // Контракт Sequelize: кастомный валидатор бросает обычный Error,
            // который Sequelize собирает в ValidationError. Доменный AppError
            // здесь неуместен — до HTTP-границы это исключение не доходит.
            endsWithYoldosh(value: string) {
               if (!value.endsWith('@yoldosh.uz')) {
                  throw new Error(
                     'Only corporate emails are allowed (@yoldosh.uz)',
                  );
               }
            },
         },
      },
      password: {
         type: DataTypes.STRING,
         allowNull: true, // Initially null, set on first login
      },
      firstName: {
         type: DataTypes.STRING,
         allowNull: false,
      },
      lastName: {
         type: DataTypes.STRING,
         allowNull: false,
      },
      role: {
         type: DataTypes.ENUM(...Object.values(AdminRole)),
         allowNull: false,
         defaultValue: AdminRole.Admin,
      },
      permissions: {
         type: DataTypes.JSONB,
         allowNull: false,
         defaultValue: {
            [AdminPermission.DRIVER_APPLICATIONS]: true,
            [AdminPermission.REPORTS]: true,
            [AdminPermission.TRIPS]: true,
            [AdminPermission.BOOKINGS]: true,
            [AdminPermission.NOTIFICATIONS]: true,
            [AdminPermission.PROMOCODES]: true,
            [AdminPermission.MODERATION]: true,
            [AdminPermission.BLOGS]: true,
            [AdminPermission.USERS]: true,
         },
      },
   },
   {
      sequelize: db,
      tableName: 'admins',
      timestamps: true,
      hooks: {
         beforeSave: async (admin: Admin) => {
            if (admin.changed('password') && admin.password) {
               const salt = await bcrypt.genSalt(10);
               admin.password = await bcrypt.hash(admin.password, salt);
            }
         },
      },
   },
);

export default Admin;
