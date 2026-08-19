import logger from '../utils/logger';
import Admin, { AdminRole } from '../../src/admin/auth/models/Admin';
import * as apiResponse from '../../shared/utils/apiResponse';
import { UserRole } from '../../src/user/models/User';
import { verifyAdminToken, verifyToken } from '../utils/jwt';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PAYNET_LOGIN, PAYNET_PASSWORD } from '../api/paynet/paynetConfig';
import { IPAK_PASSWORD, IPAK_USER } from '../api/ipakYoli/ipakConfig';
import { syncUserLanguage } from '../utils/userLanguageSync';

declare global {
   namespace Express {
      interface Request {
         user?: {
            id: string;
            role: UserRole;
         };
         admin?: any;
      }
   }
}

export const auth = async (
   req: Request,
   res: Response,
   next: NextFunction,
): Promise<void> => {
   try {
      const token =
         req.cookies.token ||
         req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
         res.status(401).json({ message: 'Authentication required' });
         return;
      }

      const decoded = await verifyToken(token);
      if (!decoded) {
         res.status(401).json({ message: 'Invalid token' });
         return;
      }

      req.user = {
         id: decoded.id,
         role: decoded.role as UserRole,
      };

      if (req.userLanguage) {
         void syncUserLanguage(decoded.id, req.userLanguage);
      }

      next();
   } catch (error) {
      logger.warn({ err: error }, 'Auth middleware error');
      res.status(401).json({ message: 'Authentication failed' });
   }
};

export const authForSearch = async (
   req: Request,
   res: Response,
   next: NextFunction,
): Promise<void> => {
   try {
      const token =
         req.cookies.token ||
         req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
         next();
         return;
      }

      const decoded = await verifyToken(token);

      if (!decoded) {
         res.status(401).json({ message: 'Invalid token' });
         return;
      }

      req.user = {
         id: decoded.id,
         role: decoded.role as UserRole,
      };

      if (req.userLanguage) {
         void syncUserLanguage(decoded.id, req.userLanguage);
      }

      next();
   } catch (error) {
      logger.warn({ err: error }, 'Auth middleware error');
      next();
   }
};

export const roleRequire = (requiredRole: UserRole): RequestHandler => {
   return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
         res.status(401).json({ message: 'User not authenticated' });
         return;
      }
      if (req.user.role !== requiredRole) {
         res.status(403).json({ message: 'User does not have permission' });
         return;
      }
      next();
   };
};

export const adminAuth = async (
   req: Request,
   res: Response,
   next: NextFunction,
): Promise<void> => {
   try {
      const token =
         req.cookies['admin-token'] ||
         req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
         res.status(401).json({ message: 'Authentication required (admin)' });
         return;
      }
      const decoded = await verifyAdminToken(token);

      if (!decoded) {
         res.status(401).json({ message: 'Invalid token payload' });
         return;
      }
      const admin = await Admin.findByPk(decoded.id, {
         attributes: { exclude: ['password'] },
      });

      if (!admin) {
         res.status(404).json({ message: 'Admin not found' });
         return;
      }

      req.admin = admin;
      (req as any).adminSessionId = decoded.sid;

      next();
   } catch (error) {
      logger.warn({ err: error }, 'AdminAuth middleware error');
      res.status(401).json({ message: 'Admin authentication failed' });
   }
};

export const adminRoleRequire = (requiredRole: AdminRole): RequestHandler => {
   return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.admin) {
         res.status(401).json({ message: 'Admin not authenticated' });
         return;
      }

      if (req.admin.role !== requiredRole) {
         res.status(403).json({ message: 'Admin does not have permission' });
         return;
      }

      next();
   };
};

export const paynetAuth = (req: Request, res: Response, next: NextFunction) => {
   const authHeader = req.headers.authorization;

   if (!authHeader || !authHeader.startsWith('Basic ')) {
      return apiResponse.unauthorized(res, 'Authentication required.');
   }

   const base64Credentials = authHeader.split(' ')[1];
   const credentials = Buffer.from(base64Credentials, 'base64').toString(
      'ascii',
   );
   const [username, password] = credentials.split(':');

   if (username === PAYNET_LOGIN && password === PAYNET_PASSWORD) {
      return next();
   } else {
      return apiResponse.unauthorized(res, 'Invalid credentials.');
   }
};

export const ipakAuth = (req: Request, res: Response, next: NextFunction) => {
   const authHeader = req.headers.authorization;

   if (!authHeader || !authHeader.startsWith('Basic ')) {
      return apiResponse.unauthorized(res, 'Authentication required.');
   }

   const base64Credentials = authHeader.split(' ')[1];
   const credentials = Buffer.from(base64Credentials, 'base64').toString(
      'ascii',
   );
   const [username, password] = credentials.split(':');

   if (username === IPAK_USER && password === IPAK_PASSWORD) {
      return next();
   } else {
      return apiResponse.unauthorized(res, 'Invalid credentials.');
   }
};
