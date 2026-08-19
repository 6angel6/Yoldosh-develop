import db from '../../../../shared/config/database';
import logger from '../../../../shared/utils/logger';
import PromoCode from '../../../promocode/models/PromoCode';
import User from '../../../user/models/User';
import Booking from '../../../booking/models/Booking';
import Wallet from '../../../payment/models/Wallet';
import Rating from '../../../rating/models/Rating';
import Car from '../../../car/model/Car';
import Trip from '../../../trips/models/Trip';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as userRepository from '../../../user/repository/userRepository';
import * as adminLogService from '../../log/service/adminLogService';
import { clearCache } from '../../../../shared/config/redis';

export const banUser = async (
   adminId: string,
   userId: string,
   reason: string,
   durationInDays?: number | null,
) => {
   const t = await db.transaction();
   try {
      const userToBan = await userRepository.findUserById(userId, t);
      if (!userToBan) {
         throw new NotFoundError('User not found.');
      }
      if (userToBan.isBanned) {
         throw new ConflictError('User is already banned.');
      }

      userToBan.isBanned = true;
      userToBan.banReason = reason;
      if (durationInDays) {
         const expiryDate = new Date();
         expiryDate.setDate(expiryDate.getDate() + durationInDays);
         userToBan.banExpiresAt = expiryDate;
      } else {
         userToBan.banExpiresAt = null;
      }
      await userToBan.save({ transaction: t });
      await t.commit();

      // Забаненный водитель должен исчезнуть из /trip/search сразу —
      // иначе висит 5 минут пока не истечёт TTL
      await Promise.all([
         clearCache(`user:profile:${userId}`),
         clearCache(`user:activity:${userId}:*`),
         clearCache('trip:search:*'),
      ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));

      await adminLogService.logAction(
         adminId,
         AdminAction.BAN_USER,
         `Reason: ${reason}. Duration: ${durationInDays ?? 'Permanent'} days.`,
         userToBan.id,
         AdminLogEntityType.USER,
         {
            snapshot: {
               label:
                  [userToBan.firstName, userToBan.lastName]
                     .filter(Boolean)
                     .join(' ') || userToBan.phoneNumber,
               subLabel: userToBan.phoneNumber,
               meta: { role: userToBan.role },
            },
            metadata: {
               reason,
               durationInDays: durationInDays ?? null,
               banExpiresAt: userToBan.banExpiresAt ?? null,
            },
         },
      );

      const { otp, otpExpires, fcmToken, ...bannedUserInfo } = userToBan.get({
         plain: true,
      });
      return {
         message: `User ${userToBan.firstName} has been successfully banned.`,
         bannedUser: bannedUserInfo,
      };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const unbanUser = async (adminId: string, userId: string) => {
   const t = await db.transaction();
   try {
      const userToUnban = await userRepository.findUserById(userId, t);

      if (!userToUnban) {
         throw new NotFoundError('User to unban not found.');
      }

      if (!userToUnban.isBanned) {
         throw new BadRequestError('This user is not currently banned.');
      }

      userToUnban.isBanned = false;
      userToUnban.banReason = null;
      userToUnban.banExpiresAt = null;
      await userToUnban.save({ transaction: t });

      await t.commit();

      // Разбан — водитель снова должен появиться в поиске
      await Promise.all([
         clearCache(`user:profile:${userId}`),
         clearCache(`user:activity:${userId}:*`),
         clearCache('trip:search:*'),
      ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));

      await adminLogService.logAction(
         adminId,
         AdminAction.UNBAN_USER,
         undefined,
         userId,
         AdminLogEntityType.USER,
         {
            snapshot: {
               label:
                  [userToUnban.firstName, userToUnban.lastName]
                     .filter(Boolean)
                     .join(' ') || userToUnban.phoneNumber,
               subLabel: userToUnban.phoneNumber,
               meta: { role: userToUnban.role },
            },
         },
      );

      return {
         message: `User ${userToUnban.firstName} has been successfully unbanned.`,
      };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const getBannedUsers = async (options: {
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
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
      range,
      from,
      to,
      startDate,
      endDate,
   } = options;
   const offset = (page - 1) * limit;

   const { rows, count } = await userRepository.findBannedUsers({
      limit,
      offset,
      sortBy,
      sortOrder,
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

export const searchUsers = async (query: string, adminId?: string) => {
   const results = await userRepository.searchUsers(query);
   if (adminId) {
      await adminLogService.logAction(
         adminId,
         AdminAction.SEARCH_USERS,
         `Запрос: "${query}" — найдено ${Array.isArray(results) ? results.length : 0}`,
         undefined,
         undefined,
         {
            metadata: {
               query,
               count: Array.isArray(results) ? results.length : 0,
            },
         },
      );
   }
   return results;
};

export const getUserDetails = async (userId: string, adminId?: string) => {
   const user = await userRepository.findUserWithDetailsById(userId);
   if (!user) {
      throw new NotFoundError('User not found.');
   }
   const plainUser = user.get({ plain: true });
   delete (plainUser as any).otp;
   delete (plainUser as any).otpExpires;
   delete (plainUser as any).fcmToken;

   if (adminId) {
      await adminLogService.logAction(
         adminId,
         AdminAction.VIEW_USER_DETAILS,
         undefined,
         user.id,
         AdminLogEntityType.USER,
         {
            snapshot: {
               label:
                  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                  user.phoneNumber,
               subLabel: user.phoneNumber,
               meta: { role: user.role },
            },
         },
      );
   }
   return plainUser;
};

export const getUserById = async (id: string) => {
   return await User.findByPk(id, {
      include: [
         {
            model: Car,
            as: 'cars',
         },
         { model: Trip, as: 'drivenTrips' },
         { model: Booking, as: 'bookingsAsPassenger' },
         { model: Wallet, as: 'wallet', required: false },
         { model: PromoCode, as: 'promoCode' },
         { model: Rating, as: 'receivedRatings' },
      ],
      attributes: { exclude: ['otp', 'otpExpires', 'password', 'fcmToken'] },
   });
};
