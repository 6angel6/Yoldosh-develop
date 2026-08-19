import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

const GUEST_COOKIE_NAME = 'guest_session_id';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

declare global {
   namespace Express {
      interface Request {
         guestId?: string;
      }
   }
}

export const SessionTracker = (
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   if (req.user) {
      return next();
   }

   let guestId = req.headers['x-guest-id'] as string;

   if (!guestId) {
      guestId = req.cookies[GUEST_COOKIE_NAME];
   }

   if (!guestId) {
      guestId = uuidv4();

      res.cookie(GUEST_COOKIE_NAME, guestId, {
         maxAge: COOKIE_MAX_AGE,
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax',
      });

      res.setHeader('x-guest-id', guestId);
   }

   req.guestId = guestId;

   return next();
};
