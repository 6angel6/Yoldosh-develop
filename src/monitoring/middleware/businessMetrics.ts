import type { Request, Response, NextFunction } from 'express';
import {
   tripSearchCounter,
   tripCreatedCounter,
   tripCreationErrorsCounter,
   bookingCreatedCounter,
   bookingErrorsCounter,
   bookingCanceledCounter,
   userRegistrationCounter,
   userLoginCounter,
   paymentProcessedCounter,
   routeErrorCount,
} from '../service/metricService';
import logger from '../../../shared/utils/logger';

export const businessMetricsMiddleware = (
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   const originalJson = res.json.bind(res);
   const originalSend = res.send.bind(res);

   res.json = function (body: any) {
      trackBusinessMetrics(req, res, body);
      return originalJson(body);
   };

   res.send = function (body: any) {
      trackBusinessMetrics(req, res, body);
      return originalSend(body);
   };

   next();
};

function trackBusinessMetrics(req: Request, res: Response, responseBody: any) {
   const route = req.route?.path || req.path;
   const method = req.method;
   const status = res.statusCode;

   try {
      if (route.includes('/trips/search') && method === 'POST') {
         const searchStatus =
            status >= 200 && status < 300 ? 'success' : 'error';
         tripSearchCounter.inc({ status: searchStatus });

         logger.debug(
            {
               operation: 'trip_search',
               status: searchStatus,
               userId: (req as any).user?.id,
            },
            'Trip search tracked',
         );
      }

      if (
         route.includes('/trips') &&
         method === 'POST' &&
         !route.includes('search')
      ) {
         if (status >= 200 && status < 300) {
            tripCreatedCounter.inc();
            logger.debug(
               {
                  operation: 'trip_created',
                  tripId: responseBody?.data?.id,
                  userId: (req as any).user?.id,
               },
               'Trip created tracked',
            );
         } else {
            tripCreationErrorsCounter.inc();
         }
      }

      if (route.includes('/booking') && method === 'POST') {
         if (status >= 200 && status < 300) {
            bookingCreatedCounter.inc();
            logger.debug(
               {
                  operation: 'booking_created',
                  bookingId: responseBody?.data?.id,
                  userId: (req as any).user?.id,
               },
               'Booking created tracked',
            );
         } else {
            bookingErrorsCounter.inc();
         }
      }

      if (route.includes('/booking') && method === 'DELETE') {
         if (status >= 200 && status < 300) {
            bookingCanceledCounter.inc();
         }
      }

      if (route.includes('/auth/register') && method === 'POST') {
         const regStatus = status >= 200 && status < 300 ? 'success' : 'error';
         userRegistrationCounter.inc({ status: regStatus });

         if (regStatus === 'success') {
            logger.debug(
               {
                  operation: 'user_registration',
                  userId: responseBody?.data?.id,
               },
               'User registration tracked',
            );
         }
      }

      if (route.includes('/auth/login') && method === 'POST') {
         const loginStatus =
            status >= 200 && status < 300 ? 'success' : 'error';
         userLoginCounter.inc({ status: loginStatus });
      }

      if (route.includes('/payment') && method === 'POST') {
         const paymentStatus =
            status >= 200 && status < 300 ? 'success' : 'error';
         const provider = responseBody?.data?.provider || 'unknown';
         paymentProcessedCounter.inc({ status: paymentStatus, provider });
      }
   } catch (error) {
      logger.error({ err: error }, 'Error tracking business metrics');
   }
}

export const errorMetricsMiddleware = (
   err: any,
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   const route = req.route?.path || 'unknown';
   const method = req.method;
   const errorType = err.name || 'UnknownError';

   routeErrorCount.inc({
      method,
      route,
      error_type: errorType,
   });

   logger.error(
      {
         err,
         route,
         method,
         userId: (req as any).user?.id,
         requestId: (req as any).id,
         statusCode: err.statusCode || 500,
      },
      'Request error occurred',
   );

   next(err);
};

export default businessMetricsMiddleware;
