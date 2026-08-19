import { User, RegistrationSource, UserLanguage } from '../../user/models/User';
import { sendOtp } from './otpService';
import {
   generateAccessToken,
   generateRefreshToken,
} from '../../../shared/utils/jwt';
import * as authRepository from '../repository/authRepository';
import logger from '../../../shared/utils/logger';
import db from '../../../shared/config/database';
import * as referralCodeService from '../../promocode/service/referralService';
import {
   BadRequestError,
   ConflictError,
   InternalServerError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import { guestUserSchemaDto } from '../models/dto/authValidation';

export const REFRESH_TOKEN_EXPIRES_IN = 100 * 24 * 60 * 60 * 1000; // 100 дней

type LoginResponse = {
   status: 'LOGIN_SUCCESS';
   user: User;
   accessToken: string;
   refreshToken: string;
   expiresIn: number;
};

type RegistrationResponse = {
   status: 'REGISTRATION_CONTINUE';
   user: User;
};

export const registerStep1 = async (
   guestId: string,
   phoneNumber: string,
   platform?: 'ios' | 'android',
   language?: UserLanguage,
): Promise<boolean> => {
   const t = await db.transaction();

   try {
      let user = await authRepository.findUserByPhoneNumber(phoneNumber);

      if (user) {
         logger.info(
            { phoneNumber },
            'Existing user found, proceeding to login',
         );
      } else if (guestId) {
         const guestUser = await authRepository.findUserById(guestId);
         if (guestUser && !guestUser.phoneNumber) {
            const updates: {
               phoneNumber: string;
               preferredLanguage?: UserLanguage;
            } = { phoneNumber };
            if (language) updates.preferredLanguage = language;
            await guestUser.update(updates, { transaction: t });
            logger.info(
               { userId: guestUser.id, phoneNumber },
               'Guest updated with phone number',
            );
            user = guestUser;
         } else if (guestUser && guestUser.phoneNumber) {
            logger.warn(
               { guestId, phoneNumber },
               'GuestId already has phone number, ignoring guestId',
            );
         }
      }

      if (!user) {
         [user] = await authRepository.findOrCreateUser(
            phoneNumber,
            {
               phoneNumber,
               firstName: 'Guest User',
               ...(language ? { preferredLanguage: language } : {}),
            },
            t,
         );
      }
      await t.commit();

      await sendOtp(user, platform);
      return true;
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const registerAndloginStep = async (
   phoneNumber: string,
   otp: string,
): Promise<LoginResponse | RegistrationResponse> => {
   const user = await authRepository.findUserByPhoneNumber(phoneNumber);

   if (!user) {
      throw new BadRequestError(
         'User not found. Please restart registration.',
         ErrorCode.AUTH_SESSION_NOT_FOUND,
      );
   }

   const isOtpValid = await user.verifyOtp(otp);
   if (!isOtpValid) {
      throw new BadRequestError(
         'Invalid or expired OTP.',
         ErrorCode.AUTH_OTP_INVALID,
      );
   }

   await authRepository.clearUserOtp(user);

   if (user.verified) {
      // Если пользователь из бота впервые логинится в приложении — фиксируем
      if (user.registration_source === RegistrationSource.FromBot) {
         await user.update({ registration_source: RegistrationSource.RegBot });
      }

      const accessToken = generateAccessToken(user.id, user.role);
      const refreshToken = generateRefreshToken(user.id);

      return {
         status: 'LOGIN_SUCCESS',
         user: user,
         accessToken: accessToken,
         refreshToken: refreshToken,
         expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      };
   } else {
      return {
         status: 'REGISTRATION_CONTINUE',
         user: user,
      };
   }
};

export const completeRegistration = async (
   userId: string,
   firstName: string,
   avatarUrl?: string,
   referralCode?: string,
): Promise<{
   user: User;
   accessToken: string;
   refreshToken: string;
   expiresIn: number;
}> => {
   const user = await getUserById(userId);

   if (user.verified) {
      // ConflictError → 409. Голый Error уходил бы клиенту как 500 и засорял
      // мониторинг: повторный complete-profile — обычный двойной тап, не сбой.
      throw new ConflictError('User is already verified and registered.');
   }

   const t = await db.transaction();

   try {
      const profileUpdates: any = {
         firstName,
         verified: true,
      };
      if (avatarUrl) profileUpdates.avatar = avatarUrl;

      await authRepository.updateUserProfile(user, profileUpdates, t);

      await t.commit();

      const accessToken = generateAccessToken(user.id, user.role);
      const refreshToken = generateRefreshToken(user.id);

      try {
         await referralCodeService.generateAndSaveCodeForUser(user.id);

         if (referralCode) {
            await referralCodeService.processReferralCode(
               user.id,
               referralCode,
            );
         }
      } catch (refError) {
         logger.error(
            { err: refError, userId: user.id },
            'Referral system error during registration',
         );
      }

      return {
         user,
         accessToken,
         refreshToken,
         expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const getUserById = async (id: string) => {
   const foundUser = await authRepository.findUserById(id);
   if (!foundUser) {
      throw new NotFoundError('User not found');
   }
   return foundUser;
};

export const createOrGetUser = async (
   guestDto: guestUserSchemaDto,
   language?: UserLanguage,
) => {
   const foundUser = await authRepository.findUserById(guestDto.guestId);
   if (foundUser) {
      return {
         guestId: foundUser.id,
         firstName: foundUser.firstName,
      };
   }

   if (!foundUser) {
      const user = await authRepository.createGuestUser(
         guestDto.guestId,
         guestDto.fcmToken,
         language,
      );
      if (!user) {
         throw new InternalServerError(
            'Failed to create guest user',
            ErrorCode.INTERNAL_UNEXPECTED,
         );
      }
      return user;
   }
};
