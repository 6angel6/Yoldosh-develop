import { Request, Response, NextFunction } from 'express';
import { AdminPermission } from '../../src/admin/auth/models/Admin';
import * as apiResponse from '../utils/apiResponse';
import logger from '../utils/logger';

export const checkPermission = (requiredPermission: AdminPermission) => {
   return (req: Request, res: Response, next: NextFunction) => {
      try {
         const admin = req.admin;

         if (!admin) {
            return apiResponse.unauthorized(res, 'Authentication required.');
         }

         if (admin.role === 'SuperAdmin') {
            return next();
         }

         if (!admin.permissions) {
            return apiResponse.forbidden(
               res,
               'You do not have permission to perform this action.',
            );
         }

         const hasPermission = admin.permissions[requiredPermission] === true;

         if (!hasPermission) {
            return apiResponse.forbidden(
               res,
               'You do not have permission to perform this action.',
            );
         }

         next();
      } catch (error) {
         logger.error(
            {
               err: error,
               adminId: req.user?.id,
               requiredPermission,
               stack: error instanceof Error ? error.stack : undefined,
            },
            'Unexpected error during permission check',
         );
         return apiResponse.error(
            res,
            'Error checking permissions. Please try again.',
            500,
         );
      }
   };
};
