import express, { Request, Response, NextFunction } from 'express';
import * as tripController from './controller/tripController';
import { asyncHandler } from '../../shared/config/lib';

const router = express.Router();

const internalKeyGuard = (req: Request, res: Response, next: NextFunction) => {
   const key = req.headers['x-internal-key'];
   const expected = process.env.INTERNAL_API_KEY;

   if (!expected) {
      // Если ключ не настроен в env — пускаем только в dev-режиме
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
   '/import',
   internalKeyGuard,
   asyncHandler(tripController.importTripsFromExternalSource),
);

export default router;
