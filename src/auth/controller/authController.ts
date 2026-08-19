import { Request, Response } from 'express';
import { z } from 'zod';
import logger from '../../../shared/utils/logger';
import * as authService from '../service/authService';
import {
   generateAccessToken,
   generateRefreshToken,
   verifyRefreshToken,
   blacklistToken,
} from '../../../shared/utils/jwt';
import { getUserById } from '../service/authService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { AppError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { formatZodError } from '../../../shared/utils/zodErrors';
import {
   guestUserSchema,
   registerStep1Schema,
   registerStep2Schema,
   registerStep3Schema,
} from '../models/dto/authValidation';
import * as userService from '../../user/service/userService';

export const registerStep1 = async (req: Request, res: Response) => {
   try {
      logger.debug({ body: req.body }, 'registerStep1 received body');
      const validatedData = registerStep1Schema.parse(req.body);

      // Платформу присылает фронт в body — это единственный надёжный способ.
      // UA оставлен как fallback на случай старых клиентов до выката.
      const userAgent = req.headers['user-agent']?.toLowerCase() || '';
      const platform: 'ios' | 'android' | undefined =
         validatedData.platform ??
         (/iphone|ipad|ipod|cfnetwork|darwin|\bios\b/.test(userAgent)
            ? 'ios'
            : /android|okhttp/.test(userAgent)
              ? 'android'
              : undefined);

      await authService.registerStep1(
         validatedData.guestId,
         validatedData.phoneNumber,
         platform,
         req.userLanguage,
      );
      logger.debug(
         { phoneNumber: validatedData.phoneNumber },
         'registerStep1 responding',
      );
      return apiResponse.success(res, null, 'OTP sent successfully.');
   } catch (error) {
      if (error instanceof z.ZodError) {
         const formattedErrors = formatZodError(error);
         return apiResponse.badRequest(
            res,
            formattedErrors,
            'Validation failed.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'registerStep1',
            phoneNumber: req.body?.phoneNumber,
         },
         'Failed to send OTP. Please try again.',
      );
   }
};

export const registerStep2 = async (req: Request, res: Response) => {
   try {
      logger.debug({ body: req.body }, 'registerStep2 received body');
      const validatedData = registerStep2Schema.parse(req.body);

      const result = await authService.registerAndloginStep(
         validatedData.phoneNumber,
         validatedData.otp,
      );

      if (result.status === 'REGISTRATION_CONTINUE') {
         logger.debug(
            { userId: result.user.id },
            'registerStep2 responding REGISTRATION_CONTINUE',
         );
         return apiResponse.success(
            res,
            { userId: result.user.id },
            'OTP verified. Please complete your profile.',
         );
      } else if (result.status === 'LOGIN_SUCCESS') {
         const { user, accessToken, refreshToken, expiresIn } = result;

         res.cookie('refresh-token', refreshToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: expiresIn,
            path: '/',
         });

         const {
            otp: _,
            otpExpires: __,
            ...userResponse
         } = user.get({ plain: true });

         logger.debug(
            { userId: user.id },
            'registerStep2 responding LOGIN_SUCCESS',
         );
         return apiResponse.success(
            res,
            {
               accessToken,
               refreshToken,
               expiresIn,
               user: userResponse,
            },
            'Login successful.',
            200,
         );
      } else {
         logger.error({ result }, 'Unexpected status in registerStep2');
         return apiResponse.badRequest(
            res,
            null,
            'Unexpected error during login.',
         );
      }
   } catch (error) {
      if (error instanceof z.ZodError) {
         const formattedErrors = formatZodError(error);
         return apiResponse.badRequest(
            res,
            formattedErrors,
            'Validation failed.',
         );
      }
      // Причина маскируется единым текстом: клиент не должен различать
      // «нет такого пользователя» и «неверный код».
      if (
         error instanceof AppError &&
         (error.code === ErrorCode.AUTH_OTP_INVALID ||
            error.code === ErrorCode.AUTH_SESSION_NOT_FOUND)
      ) {
         logger.warn(
            { phoneNumber: req.body?.phoneNumber, error_code: error.code },
            'Invalid OTP or login failed (exception)',
         );
         return apiResponse.badRequest(res, 'Invalid OTP or login failed.');
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'registerStep2',
            phoneNumber: req.body?.phoneNumber,
         },
         'Failed to verify OTP. Please check your code and try again.',
      );
   }
};

export const registerStep3 = async (req: Request, res: Response) => {
   try {
      const validatedData = registerStep3Schema.parse(req.body);

      let avatarUrl: string | undefined = undefined;
      if (req.file) {
         avatarUrl = `/users/avatars/${req.file.filename}`;
      }

      const {
         user: completedUser,
         accessToken,
         refreshToken,
         expiresIn,
      } = await authService.completeRegistration(
         validatedData.userId,
         validatedData.firstName,
         avatarUrl,
         validatedData.referralCode,
      );

      res.cookie('refresh-token', refreshToken, {
         httpOnly: true,
         sameSite: 'lax',
         secure: process.env.NODE_ENV === 'production',
         maxAge: expiresIn,
         path: '/',
      });

      const {
         otp: _,
         otpExpires: __,
         ...userResponse
      } = completedUser.get({ plain: true });

      return apiResponse.success(
         res,
         {
            accessToken,
            refreshToken,
            expiresIn,
            user: userResponse,
         },
         'Registration completed successfully.',
         201,
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         const formattedErrors = formatZodError(error);
         return apiResponse.badRequest(
            res,
            formattedErrors,
            'Validation failed.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'registerStep3',
            userId: req.body?.userId,
         },
         'Failed to complete registration. Please try again.',
      );
   }
};

export const logout = async (req: Request, res: Response) => {
   try {
      const token = req.headers.authorization?.split(' ')[1];

      if (token) {
         await blacklistToken(token);
         logger.info(
            { userId: (req as any).user?.id, token: token.substring(0, 10) },
            'Token blacklisted on logout',
         );
      }

      const userId = (req as any).user?.id;
      if (userId) {
         await userService.clearPushToken(userId);
         logger.info({ userId }, 'FCM token removed on logout');
      }

      res.clearCookie('refresh-token');

      return apiResponse.success(res, null, 'Logged out successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'logout',
            userId: (req as any).user?.id,
         },
         'Failed to logout. Please try again.',
      );
   }
};

export const refreshToken = async (req: Request, res: Response) => {
   const refreshToken = req.cookies['refresh-token'];

   if (!refreshToken) {
      return apiResponse.unauthorized(res, 'Refresh token not found');
   }

   try {
      const decodedPayload = verifyRefreshToken(refreshToken);
      if (!decodedPayload) {
         return apiResponse.unauthorized(res, 'Refresh token is not valid');
      }

      const foundUser = await getUserById(decodedPayload.id);

      const newAccessToken = generateAccessToken(foundUser.id, foundUser.role);
      const newRefreshToken = generateRefreshToken(foundUser.id);

      res.cookie('refresh-token', newRefreshToken, {
         httpOnly: true,
         sameSite: 'lax',
         secure: process.env.NODE_ENV === 'production',
         maxAge: 100 * 24 * 60 * 60 * 1000,
         path: '/',
      });

      return apiResponse.success(
         res,
         {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
         },
         'Tokens refreshed successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'refreshToken',
         },
         'Failed to refresh token. Please login again.',
      );
   }
};

export const registerGuest = async (req: Request, res: Response) => {
   try {
      const data = guestUserSchema.parse(req.body);

      const guestUsers = await authService.createOrGetUser(
         data,
         req.userLanguage,
      );

      return apiResponse.success(
         res,
         guestUsers,
         'Fetched guest user successfully',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'guestUser',
            userId: req.user?.id,
         },
         'Failed to create or get guestUser. Please try again.',
      );
   }
};
