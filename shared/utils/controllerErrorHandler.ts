import { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errorHandler';
import * as apiResponse from './apiResponse';
import { ErrorCode } from './errorCodes';

export const handleControllerError = (
   res: Response,
   error: unknown,
   context: {
      operation: string;
      userId?: string;
      [key: string]: any;
   },
   fallbackMessage: string = 'An unexpected error occurred. Please try again.',
): Response => {
   if (error instanceof ZodError) {
      const firstError = error.issues[0];
      // Форма тела прежняя (детали в errors, message 'Bad Request.');
      // error_code — аддитивное поле для метрики app_errors_total
      return apiResponse.error(
         res,
         'Bad Request.',
         400,
         firstError?.message || 'Validation failed',
         ErrorCode.VALIDATION_FAILED,
      );
   }

   // Валидаторы моделей Sequelize (например, email админа) — это невалидный
   // вход, 400, а не 500
   if (
      error instanceof Error &&
      error.name === 'SequelizeValidationError' &&
      Array.isArray((error as any).errors)
   ) {
      const firstError = (error as any).errors[0];
      return apiResponse.error(
         res,
         'Bad Request.',
         400,
         firstError?.message || 'Validation failed',
         ErrorCode.VALIDATION_FAILED,
      );
   }

   // error.code (если задан) уходит в лог и аддитивным полем error_code в тело.
   if (error instanceof AppError) {
      return apiResponse.error(
         res,
         error.message,
         error.statusCode,
         undefined,
         error.code,
      );
   }

   const isDevelopment = process.env.NODE_ENV !== 'production';
   const errorMessage = error instanceof Error ? error.message : String(error);
   const errorStack = error instanceof Error ? error.stack : undefined;

   // Лог не пишется здесь: apiResponse.error логирует 5xx ровно один раз,
   // stack и operation уходят туда через logContext
   const logContext = {
      err: error,
      ...context,
      stack: errorStack,
   };

   if (isDevelopment) {
      return apiResponse.error(
         res,
         fallbackMessage,
         500,
         {
            error: errorMessage,
            stack: errorStack,
            context: context,
         },
         undefined,
         logContext,
      );
   }

   return apiResponse.error(
      res,
      fallbackMessage,
      500,
      undefined,
      undefined,
      logContext,
   );
};
