import logger from '../utils/logger';
import { NextFunction, Response, Request } from 'express';

declare global {
   namespace Express {
      interface Request {
         id?: string;
      }
   }
}

export const errorHandler = (
   err: any,
   req: Request,
   res: Response,
   next: NextFunction,
) => {
   const status = err.status || err.statusCode || 500;
   const requestId = req.id || 'unknown';
   const isClientError = status >= 400 && status < 500;

   logger[isClientError ? 'warn' : 'error'](
      {
         err: {
            message: err.message,
            code: err.code,
            stack: isClientError ? undefined : err.stack,
            name: err.name,
         },
         status,
         path: req.originalUrl,
         method: req.method,
         query: req.query,
         // тело запроса в prod не логируем (PII/платёжные данные); вне prod —
         // redact в logger маскирует чувствительные поля
         body:
            process.env.NODE_ENV !== 'production' && req.method !== 'GET'
               ? req.body
               : undefined,
         requestId,
         userId: (req as any).user?.id,
         timestamp: new Date().toISOString(),
      },
      `[${status}] ${err.message || 'Request error'}`,
   );

   res.status(status).json({
      error: {
         code: err.code || 'INTERNAL_ERROR',
         message: isClientError
            ? err.message
            : `Internal server error. Request ID: ${requestId}`,
         requestId,
         timestamp: new Date().toISOString(),
      },
   });
};
