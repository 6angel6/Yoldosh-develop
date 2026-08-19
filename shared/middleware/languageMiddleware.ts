import { Request, Response, NextFunction } from 'express';
import { parseAcceptLanguage } from '../i18n/i18nService';
import { UserLanguage } from '../../src/user/models/User';

declare global {
   namespace Express {
      interface Request {
         userLanguage?: UserLanguage;
         userId?: string;
      }
   }
}

export const languageMiddleware = async (
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   try {
      const acceptLanguage = req.headers['accept-language'];
      const detectedLanguage: UserLanguage =
         parseAcceptLanguage(acceptLanguage);

      req.userLanguage = detectedLanguage;

      next();
   } catch (error) {
      req.userLanguage = UserLanguage.Russian;
      next();
   }
};

export default languageMiddleware;
