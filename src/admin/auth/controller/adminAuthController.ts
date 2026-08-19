import { Request, Response } from 'express';
import { REFRESH_TOKEN_EXPIRES_IN } from '../../../auth/service/authService';
import * as adminAuthService from '../service/adminAuthService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';

export const login = async (req: Request, res: Response) => {
   const { email, password } = req.body ?? {};

   if (!email) {
      return apiResponse.badRequest(res, 'Email is required.');
   }

   try {
      const { admin, accessToken, refreshToken } = await adminAuthService.login(
         email,
         password,
         req,
      );

      res.cookie('admin-refresh-token', refreshToken, {
         httpOnly: true,
         sameSite: 'lax',
         secure: process.env.NODE_ENV === 'production',
         maxAge: REFRESH_TOKEN_EXPIRES_IN,
         path: '/',
      });

      return apiResponse.success(
         res,
         { admin, accessToken },
         'Login successful.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'adminLogin',
            email,
         },
         'Failed to login. Please check your credentials and try again.',
      );
   }
};

export const logout = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id || req.user?.id;
      const sessionId = (req as any).adminSessionId as string | undefined;
      await adminAuthService.logout(adminId, req, sessionId);
      res.clearCookie('admin-refresh-token');
      return apiResponse.success(res, null, 'Logged out successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'adminLogout',
            adminId: req.user?.id || req.admin?.id,
         },
         'Failed to logout. Please try again.',
      );
   }
};

export const me = async (req: Request, res: Response) => {
   try {
      const admin = req.admin;
      if (!admin) {
         return apiResponse.unauthorized(res, 'Admin not authenticated.');
      }
      return apiResponse.success(res, admin);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'adminMe',
            adminId: req.admin?.id,
         },
         'Failed to fetch admin profile. Please try again.',
      );
   }
};
