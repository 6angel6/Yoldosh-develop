import dotenv from 'dotenv';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { redisClient, getRedisAvailable } from '../config/redis';
import logger from './logger';
import { UserRole } from '../../src/user/models/User';
import { AdminRole } from '../../src/admin/auth/models/Admin';

dotenv.config();

const JWT_EXPIRES_IN = '30d';
export const REFRESH_EXPIRES_IN = '30d';
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) {
   throw new Error('JWT_SECRET is not defined in environment variables');
}

if (!REFRESH_SECRET) {
   throw new Error(
      'JWT_REFRESH_SECRET is not defined in environment variables',
   );
}

export const generateAccessToken = (
   userId: string,
   role: UserRole | AdminRole,
   sessionId?: string,
) => {
   const payload: Record<string, unknown> = { id: userId, role };
   if (sessionId) payload.sid = sessionId;
   return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
   });
};

export const generateRefreshToken = (userId: string) => {
   return jwt.sign({ id: userId }, REFRESH_SECRET, {
      expiresIn: REFRESH_EXPIRES_IN,
   });
};

export const verifyAdminToken = async (
   token: string,
): Promise<{ id: string; role: string; sid?: string } | null> => {
   try {
      let isBlacklisted = false;
      try {
         const result = await redisClient.exists(`blacklist:${token}`);
         isBlacklisted = result === 1;
      } catch (redisError) {
         logger.warn(
            { err: redisError },
            'Redis unavailable during token verification',
         );
      }

      if (isBlacklisted) {
         logger.warn(
            { token: token.substring(0, 10) },
            'Attempted use of blacklisted token',
         );
         return null;
      }
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

      if (!decoded.id || !decoded.role) {
         return null;
      }
      return {
         id: decoded.id,
         role: decoded.role,
         sid: typeof decoded.sid === 'string' ? decoded.sid : undefined,
      };
   } catch (error) {
      logger.error({ err: error }, 'Token verification failed');
      return null;
   }
};

export const verifyToken = async (
   token: string,
): Promise<{ id: string; role?: UserRole } | null> => {
   try {
      let isBlacklisted = false;
      if (getRedisAvailable() && redisClient.isOpen) {
         try {
            const result = await redisClient.exists(`blacklist:${token}`);
            isBlacklisted = result === 1;
         } catch (redisError) {
            logger.warn(
               { err: redisError },
               'Redis unavailable during token verification',
            );
         }
      }

      if (isBlacklisted) {
         logger.warn(
            { token: token.substring(0, 10) },
            'Attempted use of blacklisted token',
         );
         return null;
      }

      return jwt.verify(token, JWT_SECRET) as {
         id: string;
         role?: UserRole;
      };
   } catch (error) {
      return null;
   }
};

export const verifyRefreshToken = (token: string): { id: string } | null => {
   try {
      return jwt.verify(token, REFRESH_SECRET) as { id: string };
   } catch (error) {
      return null;
   }
};

export const blacklistToken = async (token: string): Promise<void> => {
   try {
      if (!getRedisAvailable() || !redisClient.isOpen) {
         logger.warn('Redis unavailable - cannot blacklist token');
         return;
      }

      const decoded = jwt.decode(token) as JwtPayload;
      if (!decoded?.exp) return;

      const expiresIn = Math.ceil(decoded.exp - Date.now() / 1000);
      if (expiresIn <= 0) return;

      await redisClient.set(`blacklist:${token}`, '1', { EX: expiresIn });

      logger.debug(
         { token: token.substring(0, 10), expiresIn },
         'Token blacklisted for logout',
      );
   } catch (error) {
      logger.error(
         {
            err: error,
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
         },
         'Failed to blacklist token - continuing without blacklist',
      );
   }
};
