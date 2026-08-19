import express, { Request, Response, NextFunction } from 'express';

import { asyncHandler } from '../../shared/config/lib';
import * as internalDriverChatController from './controller/internalDriverChatController';

const router = express.Router();

const internalKeyGuard = (req: Request, res: Response, next: NextFunction) => {
   const key = req.headers['x-internal-key'];
   const expected = process.env.INTERNAL_API_KEY;

   if (!expected) {
      if (process.env.NODE_ENV === 'production') {
         return res
            .status(503)
            .json({ ok: false, error: 'Internal API not configured' });
      }
      return next();
   }

   if (key !== expected) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
   }

   return next();
};

router.post(
   '/incoming',
   internalKeyGuard,
   asyncHandler(internalDriverChatController.incomingDriverMessage),
);

export default router;
