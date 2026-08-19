import {
   User,
   Gender,
   UserRole,
   RegistrationSource,
   UserCreationAttributes,
} from '../models/User';
import { Op, Sequelize, Transaction } from 'sequelize';
import Wallet from '../../payment/models/Wallet';
import PromoCode from '../../promocode/models/PromoCode';
import Car from '../../car/model/Car';
import Trip from '../../trips/models/Trip';
import Booking from '../../booking/models/Booking';
import Report from '../models/Report';
import { UpdateUserProfileDto } from '../models/dto/userValidation';
import UserBlocks, { UserBlockStatus } from '../models/UserBlocks';
import transaction from '../../payment/models/Transaction';
import { getOrSetCache } from '../../../shared/config/redis';
import {
   DateRangeInput,
   getDateRangeBounds,
} from '../../../shared/utils/dateRange';
export const findUserById = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   const queryOptions: any = {};

   if (transaction) {
      queryOptions.transaction = transaction;
   }

   return await User.findByPk(userId, queryOptions);
};

export const findUserByIdProfile = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findOne({
      where: { id: userId },
      attributes: [
         'id',
         'firstName',
         'lastName',
         'avatar',
         'role',
         'bio',
         'rating',
         'gender',
         'date_of__birthday',
         'talkative',
         'music_allowed',
         'pets_allowed',
         [
            Sequelize.literal(
               '(SELECT COUNT(*)::int FROM ratings r WHERE r.rated_user_id = "User"."id")',
            ),
            'ratingCount',
         ],
      ],
   });
};

export const findUserByIdWithWallet = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findByPk(userId, {
      include: [{ model: Wallet, as: 'wallet', required: false }],
      transaction,
   });
};

export const getUserMe = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findByPk(userId, {
      attributes: [
         'id',
         'firstName',
         'lastName',
         'avatar',
         'phoneNumber',
         'verified',
         'passport_verified',
         'bio',
         'gender',
         'role',
         'date_of__birthday',
         'talkative',
         'music_allowed',
         'pets_allowed',
         'notificationPreferences',
         [
            Sequelize.literal(
               '(EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = "User"."id") OR EXISTS (SELECT 1 FROM bookings b WHERE b."passengerId" = "User"."id"))',
            ),
            'hasFirstTrip',
         ],
      ],
      include: [
         {
            model: Wallet,
            as: 'wallet',
            required: false,
            attributes: ['id', 'balance', 'currency'],
         },
         {
            model: Car,
            as: 'cars',
            required: false,
            attributes: [
               'id',
               'color',
               'make',
               'model',
               'gov_number',
               'status',
            ],
         },
      ],
      transaction,
   });
};

export const findUserByPhoneNumber = async (
   phoneNumber: string,
   transaction?: Transaction,
) => {
   return await User.findOne({ where: { phoneNumber }, transaction });
};

export const updatePassportStatus = async (
   userId: string,
   passport_verified: boolean,
   transaction?: Transaction,
) => {
   return await User.update(
      { passport_verified: passport_verified },
      { where: { id: userId }, transaction },
   );
};

export const getUserProfile = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findByPk(userId, {
      attributes: [
         'id',
         'firstName',
         'lastName',
         'avatar',
         'phoneNumber',
         'date_of__birthday',
         'bio',
         'role',
         'rating',
         'gender',
         'talkative',
         'music_allowed',
         'pets_allowed',
         [
            Sequelize.literal(
               '(SELECT COUNT(*)::int FROM ratings r WHERE r.rated_user_id = "User"."id")',
            ),
            'rating_count',
         ],
         [
            Sequelize.literal(
               '(EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = "User"."id") OR EXISTS (SELECT 1 FROM bookings b WHERE b."passengerId" = "User"."id"))',
            ),
            'hasFirstTrip',
         ],
      ],
      transaction,
   });
};
export const saveUser = async (
   user: User,
   transaction?: Transaction,
): Promise<User> => {
   return await user.save({ transaction });
};

export const createUser = async (
   data: UserCreationAttributes,
   transaction?: Transaction,
): Promise<User> => {
   return await User.create(data, { transaction });
};

export const findUserNameById = async (
   id: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findByPk(id, {
      attributes: ['id', 'firstName', 'lastName'],
      transaction,
   });
};

export const findUserPushTokensById = async (
   id: string,
   transaction?: Transaction,
): Promise<User | null> => {
   // fcm_token и voip_token исключены из defaultScope — запрашиваем явно.
   return await User.findByPk(id, {
      attributes: [
         'id',
         ['fcm_token', 'fcmToken'],
         ['voip_token', 'voipToken'],
      ],
      transaction,
   });
};

export const findUsersByIdsBasic = async (
   ids: string[],
   transaction?: Transaction,
): Promise<User[]> => {
   return await User.findAll({
      where: { id: ids },
      attributes: ['id', 'firstName', 'lastName', 'avatar'],
      transaction,
   });
};

export const findUserByIdForUpdate = async (
   userId: string,
   transaction: Transaction,
): Promise<User | null> => {
   return await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
   });
};

export const findUserForNotification = async (
   userId: string,
   transaction?: Transaction,
): Promise<User | null> => {
   return await User.findByPk(userId, {
      attributes: [
         'id',
         ['fcm_token', 'fcmToken'],
         'notificationPreferences',
         'preferredLanguage',
      ],
      transaction,
   });
};

export const findAllUsersForBroadcast = async (): Promise<User[]> => {
   return await User.findAll();
};

export const updateUserProfileValid = async (
   user: User,
   updates: UpdateUserProfileDto,
): Promise<User | null> => {
   Object.assign(user, updates);
   return await user.save();
};

export const updateUserProfile = async (
   user: User,
   updates: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      gender?: Gender;
      date_of__birthday?: Date;
      avatar?: string;
      role?: UserRole;
   },
   transaction?: Transaction,
): Promise<User> => {
   Object.assign(user, updates);
   return await user.save({ transaction });
};

export const deleteUser = async (
   user: User,
   transaction?: Transaction,
): Promise<void> => {
   user.phoneNumber = null;
   user.avatar = null;
   user.fcmToken = null;
   user.verified = false;
   await user.save({ transaction, validate: false });

   await user.destroy({ transaction });
};

export const findBannedUsers = async (
   options: DateRangeInput & {
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: string;
   },
): Promise<{
   rows: User[];
   count: number;
}> => {
   const { limit, offset, sortBy, sortOrder } = options;
   const whereClause: any = { isBanned: true };

   const bounds = getDateRangeBounds(options);
   if (bounds) {
      whereClause.updatedAt = { [Op.between]: [bounds.start, bounds.end] };
   }

   return await User.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      attributes: {
         exclude: ['otp', 'otpExpires', 'fcmToken'],
      },
   });
};

export const findAllUsers = async (
   options: DateRangeInput & {
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: string;
      search?: string;
      role?: UserRole;
      hasPromoCode?: 'true' | 'false';
      registrationSource?: RegistrationSource | string;
      verified?: 'true' | 'false';
      banned?: 'true' | 'false';
   },
): Promise<{
   rows: User[];
   count: number;
}> => {
   const {
      limit,
      offset,
      sortBy,
      sortOrder,
      search,
      role,
      hasPromoCode,
      registrationSource,
      verified,
      banned,
   } = options;
   const whereClause: any = {};

   if (search) {
      whereClause[Op.or] = [
         { firstName: { [Op.iLike]: `%${search}%` } },
         { lastName: { [Op.iLike]: `%${search}%` } },
         { phoneNumber: { [Op.iLike]: `%${search}%` } },
      ];
   }

   if (role) whereClause.role = role;

   if (hasPromoCode === 'true') whereClause.isHavePromocode = true;
   else if (hasPromoCode === 'false') whereClause.isHavePromocode = false;

   if (registrationSource) {
      whereClause.registration_source = registrationSource;
   }
   if (verified === 'true') whereClause.verified = true;
   else if (verified === 'false') whereClause.verified = false;
   if (banned === 'true') whereClause.isBanned = true;
   else if (banned === 'false') whereClause.isBanned = false;

   const bounds = getDateRangeBounds(options);
   if (bounds) {
      whereClause.createdAt = { [Op.between]: [bounds.start, bounds.end] };
   }

   return await User.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      attributes: {
         exclude: [
            'otp',
            'otpExpires',
            'password',
            'fcmToken',
            'notificationPreferences',
         ],
      },
      include: [
         {
            model: PromoCode,
            as: 'promoCode',
            required: false,
         },
      ],
   });
};
export const searchUsers = async (query: string): Promise<User[]> => {
   return User.findAll({
      where: {
         [Op.or]: [
            { firstName: { [Op.iLike]: `%${query}%` } },
            { lastName: { [Op.iLike]: `%${query}%` } },
            { phoneNumber: { [Op.iLike]: `%${query}%` } },
         ],
      },
      limit: 20,
      attributes: [
         'id',
         'firstName',
         'lastName',
         'phoneNumber',
         'avatar',
         'role',
      ],
   });
};

export const findUserWithDetailsById = async (
   userId: string,
): Promise<User | null> => {
   return User.findByPk(userId, {
      attributes: { exclude: ['otp', 'otpExpires', 'password', 'fcmToken'] },
      include: [
         { model: Wallet, as: 'wallet', required: false },
         {
            model: Car,
            as: 'cars',
         },
         {
            model: Trip,
            as: 'drivenTrips',
            limit: 10,
            order: [['departure_ts', 'DESC']],
         },
         {
            model: Booking,
            as: 'bookingsAsPassenger',
            limit: 10,
            order: [['createdAt', 'DESC']],
         },
         {
            model: Report,
            as: 'submittedReports',
            limit: 10,
            order: [['createdAt', 'DESC']],
         },
         {
            model: Report,
            as: 'receivedReports',
            limit: 10,
            order: [['createdAt', 'DESC']],
         },
      ],
   });
};

export const changeUserRole = async (
   user_id: string,
   role: UserRole,
   t?: Transaction,
): Promise<any> => {
   return await User.update(
      { role: role },
      {
         where: { id: user_id },
         transaction: t,
      },
   );
};

export const blockUser = async (
   blockerId: string,
   targetUserId: string,
   t?: Transaction,
) => {
   return await UserBlocks.create({
      blocker_id: blockerId,
      blocked_id: targetUserId,
      status: UserBlockStatus.BLOCKED,
   });
};

export const unblockUser = async (
   blockerId: string,
   targetUserId: string,
   t?: Transaction,
) => {
   return await UserBlocks.destroy({
      where: {
         blocker_id: blockerId,
         blocked_id: targetUserId,
      },
      transaction: t,
   });
};

export const isUserBlocked = async (
   userId1: string,
   userId2: string,
): Promise<boolean> => {
   const block = await UserBlocks.findOne({
      where: {
         [Op.or]: [
            { blocker_id: userId1, blocked_id: userId2 },
            { blocker_id: userId2, blocked_id: userId1 },
         ],
         status: UserBlockStatus.BLOCKED,
      },
   });
   return !!block;
};
/**
 * Кэшируем список блокировок: вызывается на каждом /trip/search и чат-операциях.
 * Инвалидируется при create/destroy UserBlocks и при banUser (см. userBlockService,
 * usersService.banUser) через clearCache('user:blocked:${userId}').
 */
export const getBlockedUserIds = async (userId: string): Promise<string[]> => {
   return getOrSetCache(
      `user:blocked:${userId}`,
      async () => {
         const blocks = await UserBlocks.findAll({
            where: {
               [Op.or]: [{ blocker_id: userId }, { blocked_id: userId }],
               status: UserBlockStatus.BLOCKED,
            },
            attributes: ['blocker_id', 'blocked_id'],
         });

         const blockedIds = new Set<string>();
         blocks.forEach((block) => {
            if (block.blocker_id === userId) {
               blockedIds.add(block.blocked_id);
            } else {
               blockedIds.add(block.blocker_id);
            }
         });

         return Array.from(blockedIds);
      },
      300,
   );
};
