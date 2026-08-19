import {
   User,
   UserCreationAttributes,
   Gender,
   UserLanguage,
} from '../../user/models/User';
import { Transaction } from 'sequelize';

export const findUserByPhoneNumber = async (
   phoneNumber: string,
   verified?: boolean,
): Promise<User | null> => {
   const whereClause: any = { phoneNumber };

   if (verified !== undefined) {
      whereClause.verified = verified;
   }

   return await User.findOne({ where: whereClause });
};

export const findOrCreateUser = async (
   phoneNumber: string,
   defaults: Partial<UserCreationAttributes>,
   transaction?: Transaction,
): Promise<[User, boolean]> => {
   return await User.findOrCreate({
      where: { phoneNumber },
      defaults: defaults as UserCreationAttributes,
      transaction,
   });
};

export const findUserById = async (
   userId: string,
   transaction?: Transaction,
): Promise<User> => {
   const queryOptions: any = {};

   if (transaction) {
      queryOptions.transaction = transaction;
   }

   return await User.findByPk(userId, queryOptions);
};

export const clearUserOtp = async (
   user: User,
   transaction?: Transaction,
): Promise<User> => {
   user.otp = null;
   user.otpExpires = null;
   return await user.save({ transaction });
};

export const updateUserProfile = async (
   user: User,
   updates: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      gender?: Gender;
      date_of__birthday?: Date;
      verified?: boolean;
      avatar?: string;
   },
   transaction?: Transaction,
): Promise<User> => {
   Object.assign(user, updates);
   return await user.save({ transaction });
};

export const createGuestUser = async (
   guestId: string,
   fcmToken: string,
   preferredLanguage?: UserLanguage,
) => {
   const user = await User.create({
      id: guestId,
      firstName: 'Guest',
      fcmToken: fcmToken,
      ...(preferredLanguage ? { preferredLanguage } : {}),
   } as UserCreationAttributes);

   return {
      guestId: user.id,
      firstName: user.firstName,
   };
};
