import { Request, Response, NextFunction } from 'express';
import { findUserById } from '../../src/user/repository/userRepository';
import * as apiResponse from '../utils/apiResponse';
import logger from '../utils/logger';

export const checkBan = async (
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   try {
      if (!req.user?.id) {
         return apiResponse.unauthorized(res, 'Authentication required.');
      }

      const user = await findUserById(req.user.id);
      if (!user) {
         return apiResponse.notFound(res, 'User not found.');
      }

      if (user.isBanned) {
         if (user.banExpiresAt && user.banExpiresAt < new Date()) {
            user.isBanned = false;
            user.banExpiresAt = null;
            user.banReason = null;
            await user.save();
         } else {
            const reason = user.banReason || 'Your account has been suspended.';
            return apiResponse.forbidden(res, `Access denied. ${reason}`);
         }
      }

      return next();
   } catch (error) {
      logger.error(
         {
            err: error,
            userId: req.user?.id,
            stack: error instanceof Error ? error.stack : undefined,
         },
         'Unexpected error during ban check',
      );
      return apiResponse.error(
         res,
         'Error checking account status. Please try again.',
         500,
      );
   }
};
