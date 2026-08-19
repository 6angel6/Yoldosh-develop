import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Admin from '../models/Admin';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import {
   generateAccessToken,
   generateRefreshToken,
} from '../../../../shared/utils/jwt';
import {
   BadRequestError,
   NotFoundError,
   UnauthorizedError,
} from '../../../../shared/utils/errorHandler';
import * as adminLogService from '../../log/service/adminLogService';
import * as adminRepository from '../repository/adminAuthRepository';

export const login = async (
   email: string,
   password?: string,
   request?: Request,
) => {
   const admin = await adminRepository.findAdminByEmail(email);

   if (!admin) {
      throw new NotFoundError('Admin with this email does not exist.');
   }

   const sessionId = uuidv4();

   if (!admin.password) {
      if (!password) {
         throw new BadRequestError('Password is required for the first login.');
      }
      admin.password = password;
      await admin.save();
      await adminLogService.logAction(
         admin.id,
         AdminAction.LOGIN,
         'First login, password set.',
         admin.id,
         AdminLogEntityType.ADMIN,
         {
            request,
            sessionId,
            snapshot: {
               label:
                  [admin.firstName, admin.lastName].filter(Boolean).join(' ') ||
                  admin.email,
               subLabel: admin.email,
               meta: { role: admin.role, firstLogin: true },
            },
         },
      );
   } else {
      if (!password) {
         throw new BadRequestError('Password is required.');
      }
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
         throw new UnauthorizedError('Invalid credentials.');
      }
      await adminLogService.logAction(
         admin.id,
         AdminAction.LOGIN,
         undefined,
         admin.id,
         AdminLogEntityType.ADMIN,
         {
            request,
            sessionId,
            snapshot: {
               label:
                  [admin.firstName, admin.lastName].filter(Boolean).join(' ') ||
                  admin.email,
               subLabel: admin.email,
               meta: { role: admin.role },
            },
         },
      );
   }

   const accessToken = generateAccessToken(admin.id, admin.role, sessionId);
   const refreshToken = generateRefreshToken(admin.id);

   return {
      admin: { id: admin.id, email: admin.email, role: admin.role },
      accessToken,
      refreshToken,
   };
};

export const logout = async (
   adminId: string,
   request?: Request,
   sessionId?: string,
) => {
   const admin = await Admin.findByPk(adminId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
   });
   await adminLogService.logAction(
      adminId,
      AdminAction.LOGOUT,
      undefined,
      adminId,
      AdminLogEntityType.ADMIN,
      {
         request,
         sessionId,
         snapshot: admin
            ? {
                 label:
                    [admin.firstName, admin.lastName]
                       .filter(Boolean)
                       .join(' ') || admin.email,
                 subLabel: admin.email,
                 meta: { role: admin.role },
              }
            : undefined,
      },
   );
};

export const me = async (adminId: string) => {
   return await Admin.findByPk(adminId);
};
