export const deleteAvatar = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const updatedUser = await userService.deleteUserAvatar(userId);
      const { otp, otpExpires, ...userResponse } = updatedUser.get({
         plain: true,
      });
      return apiResponse.success(
         res,
         { user: userResponse },
         'Avatar deleted successfully',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteAvatar',
            userId: req.user?.id,
         },
         'Failed to delete avatar. Please try again.',
      );
   }
};
import { Request, Response } from 'express';
import * as userService from '../service/userService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { updateUserProfileSchema } from '../models/dto/userValidation';
import { DevicePlatform } from '../models/User';
import { z } from 'zod';
import { formatZodError } from '../../../shared/utils/zodErrors';
import { isValidPhoneNumber } from '../../../shared/config/lib';
import {
   blockUserSchema,
   userIdPathParamsSchema,
} from '../models/dto/userValidation';

export const getMe = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const user = await userService.getUserMe(userId);

      return apiResponse.success(res, user);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMe',
            userId: req.user?.id,
         },
         'Failed to fetch your profile. Please try again.',
      );
   }
};

export const getUserProfile = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const user = await userService.getUserProfile(userId);

      return apiResponse.success(res, { user: user });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getUserProfile',
            userId: req.user?.id,
         },
         'Failed to fetch your profile. Please try again.',
      );
   }
};

export const updateProfile = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;

      const validatedData = updateUserProfileSchema.parse(req.body);

      const updatedUser = await userService.updateUserProfile(
         userId,
         validatedData,
      );

      const { otp, otpExpires, ...userResponse } = updatedUser.get({
         plain: true,
      });
      return apiResponse.success(
         res,
         { user: userResponse },
         'Profile updated successfully',
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
            operation: 'updateProfile',
            userId: req.user?.id,
         },
         'Failed to update your profile. Please try again.',
      );
   }
};

export const updateAvatar = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;

      if (!req.file) {
         return apiResponse.badRequest(res, 'No avatar file provided');
      }

      const avatarUrl = `/users/avatars/${req.file.filename}`;
      const updatedUser = await userService.updateUserAvatar(userId, avatarUrl);

      const { otp, otpExpires, ...userResponse } = updatedUser.get({
         plain: true,
      });

      return apiResponse.success(
         res,
         { user: userResponse },
         'Avatar updated successfully',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateAvatar',
            userId: req.user?.id,
         },
         'Failed to update your avatar. Please try again.',
      );
   }
};

export const getUserById = async (req: Request, res: Response) => {
   try {
      const { id } = userIdPathParamsSchema.parse(req.params);
      const requesterId = req.user?.id;
      const user = await userService.getUserById(id, requesterId);

      const { otp, otpExpires, ...userResponse } = user.get({ plain: true });

      return apiResponse.success(res, { user: userResponse });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getUserById',
            requestedUserId: req.params.id,
         },
         'Failed to fetch user profile. Please try again.',
      );
   }
};

export const deleteAccount = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      await userService.deleteUser(userId);

      res.clearCookie('refresh-token');

      return apiResponse.success(res, null, 'Account deleted successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteAccount',
            userId: req.user?.id,
         },
         'Failed to delete your account. Please try again.',
      );
   }
};

export const updateFcmToken = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      // iOS дополнительно шлёт voipToken (PushKit) + platform — он нужен, чтобы
      // звонок дозвонился до iPhone (CallKit). Android шлёт только fcmToken.
      // В Express 5 req.body бывает undefined (без JSON Content-Type) —
      // деструктуризация давала TypeError и 500
      const { fcmToken, voipToken, platform } = req.body ?? {};

      if (!fcmToken) {
         return apiResponse.badRequest(res, 'fcmToken is required.');
      }
      if (
         platform !== undefined &&
         platform !== DevicePlatform.IOS &&
         platform !== DevicePlatform.ANDROID
      ) {
         return apiResponse.badRequest(
            res,
            'platform must be "ios" or "android".',
         );
      }

      await userService.updateFcmToken(userId, {
         fcmToken,
         voipToken,
         platform,
      });
      return apiResponse.success(
         res,
         null,
         'Push tokens updated successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateFcmToken',
            userId: req.user?.id,
         },
         'Failed to update notification token. Please try again.',
      );
   }
};

export const deleteUserByPhone = async (req: Request, res: Response) => {
   try {
      const { phoneNumber } = req.body ?? {};
      if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
         return apiResponse.badRequest(res, 'Invalid phone number format.');
      }

      await userService.deleteUserByPhone(phoneNumber);
      res.clearCookie('refresh-token');
      return apiResponse.success(res, null, 'User deleted successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteUserByPhone',
            userId: req.user?.id,
         },
         'Failed to delete user by phone. Please try again.',
      );
   }
};

export const blockUser = async (req: Request, res: Response) => {
   try {
      const blockerId = req.user.id;
      const { userId: targetUserId } = blockUserSchema.parse(req.body);

      await userService.blockUser(blockerId, targetUserId);
      return apiResponse.success(res, null, 'User blocked successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'blockUser',
            userId: req.user?.id,
            blockedUserId: req.params.userId,
         },
         'Failed to block user. Please try again.',
      );
   }
};

export const unblockUser = async (req: Request, res: Response) => {
   try {
      const blockerId = req.user.id;
      const { userId: targetUserId } = blockUserSchema.parse(req.body);

      await userService.unblockUser(blockerId, targetUserId);
      return apiResponse.success(res, null, 'User unblockUser successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'unblockUser',
            userId: req.user?.id,
            blockedUserId: req.params.userId,
         },
         'Failed to unblockUser user. Please try again.',
      );
   }
};

export const getBlockedUsers = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const blockedUsers = await userService.getBlockedUsers(userId);
      return apiResponse.success(
         res,
         { blockedUsers },
         'Blocked users retrieved successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getBlockedUsers',
            userId: req.user?.id,
         },
         'Failed to retrieve blocked users. Please try again.',
      );
   }
};
