import fs from 'fs';
import path from 'path';
import * as userRepository from '../repository/userRepository';
import { UpdateUserProfileDto } from '../models/dto/userValidation';
import { clearCache, getOrSetCache } from '../../../shared/config/redis';
import User, { UserRole, DevicePlatform } from '../models/User';
import {
   BadRequestError,
   InternalServerError,
   NotFoundError,
   UnauthorizedError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import logger from '../../../shared/utils/logger';

export const deleteUserAvatar = async (userId: string): Promise<User> => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }
   if (user.avatar) {
      const publicDir = path.join(process.cwd(), 'public');
      const avatarPath = path.join(publicDir, user.avatar);
      try {
         await fs.promises.access(avatarPath);
         await fs.promises.unlink(avatarPath);
      } catch (err) {
         logger.warn(`Could not delete avatar at ${avatarPath}: ${err}`);
      }
      await userRepository.updateUserProfile(user, { avatar: null });
      await clearCache(`user:profile:${userId}`).catch((err) =>
         logger.warn({ err }, 'Cache invalidation failed'),
      );
      user.avatar = null;
   }
   return user;
};

export const updateUserProfile = async (
   userId: string,
   profileData: UpdateUserProfileDto,
) => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }

   const updatedUser = await userRepository.updateUserProfileValid(
      user,
      profileData,
   );

   // Инвалидация кэша ПОСЛЕ обновления
   await clearCache(`user:profile:${userId}`).catch((err) =>
      logger.warn({ err }, 'Cache invalidation failed'),
   );

   return updatedUser;
};

export const updateUserAvatar = async (
   userId: string,
   avatarUrl: string,
): Promise<User> => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }

   if (user.avatar) {
      const publicDir = path.join(process.cwd(), 'public');
      const oldAvatarPath = path.join(publicDir, user.avatar);

      try {
         await fs.promises.access(oldAvatarPath);
         await fs.promises.unlink(oldAvatarPath);
      } catch (err) {
         logger.warn(`Could not delete old avatar at ${oldAvatarPath}: ${err}`);
      }
   }

   await userRepository.updateUserProfile(user, { avatar: avatarUrl });
   await clearCache(`user:profile:${userId}`).catch((err) =>
      logger.warn({ err }, 'Cache invalidation failed'),
   );

   return user;
};

export const getUserById = async (userId: string, requesterId?: string) => {
   const user = await userRepository.findUserByIdProfile(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }

   if (requesterId && requesterId !== userId) {
      const blocked = await userRepository.isUserBlocked(requesterId, userId);
      if (blocked) {
         throw new NotFoundError('User not found'); // Возвращаем 404 вместо 403 для приватности
      }
   }

   return user;
};

export const getUserMe = async (userId: string) => {
   const user = await userRepository.getUserMe(userId);
   if (!user) {
      throw new UnauthorizedError();
   }
   return user;
};

export const getUserProfile = async (userId: string) => {
   const cacheKey = `user:profile:${userId}`;
   return await getOrSetCache(
      cacheKey,
      async () => {
         const user = await userRepository.getUserProfile(userId);
         if (!user) {
            throw new NotFoundError('User not found');
         }
         return user;
      },
      1800, // TTL: 30 минут (профиль не меняется часто)
   );
};

export const deleteUser = async (userId: string): Promise<void> => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }

   if (user.avatar) {
      const avatarPath = path.join(__dirname, '../../public', user.avatar);
      // async-версии: sync-IO блокирует event loop в рантайме запроса
      try {
         await fs.promises.unlink(avatarPath);
      } catch (err) {
         logger.warn({ err, avatarPath }, 'Could not delete avatar file');
      }
   }

   await userRepository.deleteUser(user);
   await clearCache(`user:profile:${user.id}`);
};

interface UpdatePushTokensInput {
   fcmToken: string;
   voipToken?: string | null;
   platform?: DevicePlatform;
}

export const updateFcmToken = async (
   userId: string,
   input: UpdatePushTokensInput,
) => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found');
   }
   user.fcmToken = input.fcmToken;
   // Частичный апдейт: присланный только fcmToken не затирает ранее
   // сохранённый voipToken/platform.
   if (input.voipToken !== undefined) user.voipToken = input.voipToken;
   if (input.platform !== undefined) user.platform = input.platform;
   return await userRepository.saveUser(user);
};

export const clearPushToken = async (userId: string): Promise<void> => {
   const user = await userRepository.findUserById(userId);
   if (!user) {
      return;
   }
   user.fcmToken = null;
   await userRepository.saveUser(user);
};

export const getAllUsers = async (options: {
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   role?: UserRole;
   hasPromoCode?: 'true' | 'false';
   registrationSource?: string;
   verified?: 'true' | 'false';
   banned?: 'true' | 'false';
   range?: string;
   from?: string;
   to?: string;
   startDate?: string;
   endDate?: string;
}) => {
   const {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      role,
      hasPromoCode,
      registrationSource,
      verified,
      banned,
      range,
      from,
      to,
      startDate,
      endDate,
   } = options;
   const offset = (page - 1) * limit;

   const { rows, count } = await userRepository.findAllUsers({
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
      range,
      from,
      to,
      startDate,
      endDate,
   });

   return {
      users: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const deleteUserByPhone = async (phoneNumber: string): Promise<void> => {
   const user = await userRepository.findUserByPhoneNumber(phoneNumber);
   if (!user) {
      throw new NotFoundError('User not found');
   }

   if (user.avatar) {
      const avatarPath = path.join(__dirname, '../../public', user.avatar);
      // async-версии: sync-IO блокирует event loop в рантайме запроса
      try {
         await fs.promises.unlink(avatarPath);
      } catch (err) {
         logger.warn({ err, avatarPath }, 'Could not delete avatar file');
      }
   }

   await userRepository.deleteUser(user);
   await clearCache(`user:profile:${user.id}`);
};

export const blockUser = async (blockerId: string, targetUserId: string) => {
   const targetUser = await userRepository.findUserById(targetUserId);
   if (!targetUser) {
      throw new NotFoundError('Пользователь не найден');
   }
   if (blockerId === targetUserId) {
      throw new BadRequestError(
         'Нельзя заблокировать самого себя',
         ErrorCode.USER_SELF_BLOCK_NOT_ALLOWED,
      );
   }

   const userBlocked = await userRepository.blockUser(blockerId, targetUserId);
   if (!userBlocked) {
      throw new InternalServerError(
         'Couldnt block user. Please try again.',
         ErrorCode.INTERNAL_UNEXPECTED,
      );
   }

   // Чистим кэш блокировок обеих сторон — фильтр в /trip/search применяется
   // вне общего кэша, через getBlockedUserIds (см. userRepository)
   await Promise.all([
      clearCache(`user:blocked:${blockerId}`),
      clearCache(`user:blocked:${targetUserId}`),
   ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));

   return userBlocked.id;
};

export const unblockUser = async (blockerId: string, targetUserId: string) => {
   const targetUser = await userRepository.findUserById(targetUserId);
   if (!targetUser) {
      throw new NotFoundError('Пользователь не найден');
   }
   if (blockerId === targetUserId) {
      throw new BadRequestError(
         'Нельзя разблокировать самого себя',
         ErrorCode.USER_SELF_BLOCK_NOT_ALLOWED,
      );
   }
   const userBlocked = await userRepository.unblockUser(
      blockerId,
      targetUserId,
   );

   await Promise.all([
      clearCache(`user:blocked:${blockerId}`),
      clearCache(`user:blocked:${targetUserId}`),
   ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));
};

export const getBlockedUsers = async (userId: string) => {
   const blockedIds = await userRepository.getBlockedUserIds(userId);

   if (blockedIds.length === 0) {
      return [];
   }

   const blockedUsers = await userRepository.findUsersByIdsBasic(blockedIds);

   return blockedUsers;
};
