import express, { Request, Response, NextFunction } from 'express';
import * as callController from './controller/callController';
import { asyncHandler } from '../../shared/config/lib';

const router = express.Router();

// Service-to-service guard: тот же паттерн, что у /internal/trips.
// Go callService шлёт x-internal-key == INTERNAL_API_KEY (его PUSH_BFF_SECRET).
const internalKeyGuard = (req: Request, res: Response, next: NextFunction) => {
   const key = req.headers['x-internal-key'];
   const expected = process.env.INTERNAL_API_KEY;

   if (!expected) {
      if (process.env.NODE_ENV === 'production') {
         return res
            .status(503)
            .json({ message: 'Internal API not configured' });
      }
      return next();
   }

   if (key !== expected) {
      return res.status(401).json({ message: 'Unauthorized' });
   }

   return next();
};

router.post(
   '/push',
   internalKeyGuard,
   asyncHandler(callController.incomingCallPush),
);

export default router;
