import bcrypt from 'bcrypt';
import db from '../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';
import logger from '../../../shared/utils/logger';
import Wallet from '../../payment/models/Wallet';

export enum Gender {
   Male = 'MALE',
   Female = 'FEMALE',
   Other = 'OTHER',
}

export enum UserRole {
   Passenger = 'Passenger',
   Driver = 'Driver',
}

export enum NavigatorPreference {
   YandexNavi = 'YANDEX_NAVI',
   GoogleMaps = 'GOOGLE_MAPS',
   None = 'NONE',
}

export enum UserLanguage {
   Russian = 'ru',
   Uzbek = 'uz',
   English = 'en',
}

export enum RegistrationSource {
   User = 'user',
   FromBot = 'from_bot',
   RegBot = 'reg_bot',
}

export enum DevicePlatform {
   IOS = 'ios',
   ANDROID = 'android',
}

export interface NotificationPreferences {
   trips: boolean;
   newsAndAgreement: boolean;
   promotionAndDiscounts: boolean;
   messages: boolean;
   general: boolean;
}

export type UserCreationAttributes = Optional<
   UserAttributes,
   'id' | 'createdAt' | 'updatedAt' | 'verified' | 'otp' | 'otpExpires'
>;

export interface UserAttributes {
   id: string;
   firstName: string;
   lastName?: string;
   phoneNumber: string;
   avatar?: string;
   bio?: string;
   date_of__birthday?: Date;
   gender?: Gender;

   talkative?: boolean | null;
   music_allowed?: boolean | null;
   pets_allowed?: boolean | null;

   rating?: number;
   role: UserRole;
   verified: boolean;
   passport_verified?: boolean;
   otp?: string;
   otpExpires?: Date;
   notificationPreferences?: NotificationPreferences;
   preferred_navigator?: NavigatorPreference;
   preferredLanguage?: UserLanguage;
   isBanned?: boolean;
   fcmToken?: string;
   voipToken?: string | null;
   platform?: DevicePlatform | null;
   isHavePromocode?: boolean;
   banExpiresAt?: Date;
   banReason?: string;
   wallet?: Wallet;
   createdAt?: Date;
   updatedAt?: Date;
   registration_source: RegistrationSource;
   tg_user?: string;
}

export class User extends Model<UserAttributes> implements UserAttributes {
   public id!: string;
   public firstName!: string;
   public lastName?: string;

   public phoneNumber!: string;
   public avatar?: string;
   public bio?: string;
   public date_of__birthday?: Date;
   public gender!: Gender;

   public talkative?: boolean | null;
   public music_allowed?: boolean | null;
   public pets_allowed?: boolean | null;

   public passport_verified?: boolean;
   public isBanned?: boolean;
   public fcmToken?: string;
   public voipToken?: string | null;
   public platform?: DevicePlatform | null;
   public isHavePromocode!: boolean;
   public banExpiresAt?: Date;
   public banReason?: string;

   public wallet?: Wallet;

   public rating!: number;
   public role!: UserRole;
   public verified!: boolean;
   public otp?: string;
   public otpExpires?: Date;
   public notificationPreferences?: NotificationPreferences;
   public preferred_navigator?: NavigatorPreference;
   public preferredLanguage?: UserLanguage;
   public registration_source!: RegistrationSource;
   public tg_user?: string;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;

   public async verifyOtp(candidateOtp: string): Promise<boolean> {
      if (!this.otp || !this.otpExpires) {
         logger.error('OTP or Expires is missing in DB');
         return false;
      }
      const now = new Date();
      logger.info(
         {
            now,
            expires: this.otpExpires,
            diff: this.otpExpires.getTime() - now.getTime(),
         },
         'Checking OTP Time',
      );

      if (now > this.otpExpires) {
         logger.error('OTP Expired');
         return false;
      }

      const isMatch = await bcrypt.compare(candidateOtp, this.otp);
      logger.info({ candidateOtp, isMatch }, 'Bcrypt comparison result');

      return isMatch;
   }
}

User.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      firstName: {
         type: DataTypes.STRING(32),
         allowNull: false,
         validate: {
            notEmpty: true,
            len: [1, 32],
         },
      },
      lastName: {
         type: DataTypes.STRING(32),
         allowNull: true,
         validate: {
            len: [0, 32],
         },
      },
      phoneNumber: {
         type: DataTypes.STRING(13),
         allowNull: true,
         unique: true,
         validate: {
            is: /^\+998[0-9]{9}$/,
         },
      },
      avatar: {
         type: DataTypes.STRING,
         allowNull: true,
      },
      bio: {
         type: DataTypes.STRING(128),
         allowNull: true,
         validate: {
            len: [0, 128],
         },
      },
      date_of__birthday: {
         type: DataTypes.DATEONLY,
         allowNull: true,
      },
      gender: {
         type: DataTypes.ENUM(...Object.values(Gender)),
         allowNull: true,
      },
      talkative: {
         type: DataTypes.BOOLEAN,
         allowNull: true,
         defaultValue: null,
      },
      music_allowed: {
         type: DataTypes.BOOLEAN,
         allowNull: true,
         defaultValue: null,
      },
      pets_allowed: {
         type: DataTypes.BOOLEAN,
         allowNull: true,
         defaultValue: null,
      },
      rating: {
         type: DataTypes.FLOAT,
         allowNull: true,
         defaultValue: 5.0,
      },
      role: {
         type: DataTypes.ENUM(...Object.values(UserRole)),
         allowNull: false,
         defaultValue: UserRole.Passenger,
      },
      verified: {
         type: DataTypes.BOOLEAN,
         defaultValue: false,
         allowNull: false,
      },
      passport_verified: {
         type: DataTypes.BOOLEAN,
         defaultValue: false,
         allowNull: false,
      },
      otp: {
         type: DataTypes.STRING,
         allowNull: true,
      },
      otpExpires: {
         type: DataTypes.DATE,
         allowNull: true,
      },
      preferred_navigator: {
         type: DataTypes.ENUM(...Object.values(NavigatorPreference)),
         allowNull: false,
         defaultValue: NavigatorPreference.YandexNavi,
      },
      preferredLanguage: {
         type: DataTypes.ENUM(...Object.values(UserLanguage)),
         allowNull: false,
         defaultValue: UserLanguage.Russian,
         field: 'preferred_language',
      },
      notificationPreferences: {
         type: DataTypes.JSONB,
         allowNull: false,
         defaultValue: {
            trips: true,
            newsAndAgreement: true,
            promotionAndDiscounts: true,
            messages: true,
            general: true,
         },
      },
      isBanned: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
         field: 'is_banned',
      },
      fcmToken: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'fcm_token',
      },
      voipToken: {
         type: DataTypes.TEXT,
         allowNull: true,
         field: 'voip_token',
      },
      platform: {
         type: DataTypes.ENUM(...Object.values(DevicePlatform)),
         allowNull: true,
         field: 'platform',
      },
      isHavePromocode: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: false,
         field: 'is_have_promocode',
      },
      banExpiresAt: {
         type: DataTypes.DATE,
         allowNull: true,
         field: 'ban_expires_at',
      },
      banReason: {
         type: DataTypes.STRING(128),
         allowNull: true,
         field: 'ban_reason',
      },
      registration_source: {
         type: DataTypes.ENUM(...Object.values(RegistrationSource)),
         defaultValue: RegistrationSource.User,
         field: 'registration_source',
      },
      tg_user: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'tg_user',
      },
   },
   {
      sequelize: db,
      modelName: 'User',
      tableName: 'users',
      defaultScope: {
         attributes: {
            exclude: ['fcm_token', 'voip_token', 'tg_user'],
         },
      },
      paranoid: true,
      hooks: {
         beforeCreate: async (user: User) => {
            if (user.otp) {
               const salt = await bcrypt.genSalt(10);
               user.otp = await bcrypt.hash(user.otp, salt);
            }
         },
         beforeUpdate: async (user: User) => {
            if (user.changed('otp') && user.otp) {
               const salt = await bcrypt.genSalt(10);
               user.otp = await bcrypt.hash(user.otp, salt);
            }
         },
      },
      indexes: [
         {
            unique: true,
            fields: ['phoneNumber'],
            name: 'idx_users_phone_unique',
         },
         {
            name: 'idx_users_role',
            fields: ['role'],
         },
         {
            name: 'idx_users_banned',
            fields: ['is_banned', 'ban_expires_at'],
            where: {
               is_banned: true,
            },
         },
         {
            name: 'idx_users_role_verified',
            fields: ['role', 'verified', 'passport_verified'],
         },
         {
            name: 'idx_users_created_at',
            fields: ['createdAt'],
         },
      ],
   },
);

export default User;
