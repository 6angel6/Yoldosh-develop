import { json, Response } from 'express';
import logger from './logger';
import { ErrorCode } from './errorCodes';
import { appErrorsTotal } from './appMetrics';

/**
 * КОНТРАКТ ОШИБКИ API (фронт привязан к этой форме — см. инвариант №1):
 *
 * ```json
 * {
 *    "success": false,
 *    "status_code": 400,
 *    "message": "<человекочитаемое>",
 *    "errors": <детали | опционально>,
 *    "error_code": "<ErrorCode | опционально, аддитивное поле>"
 * }
 * ```
 *
 * Правила:
 * - Поля `success`, `status_code`, `message`, `errors` не переименовывать,
 *   не удалять, не менять тип. Новые поля — только аддитивно.
 * - `error_code` — необязательный машиночитаемый код из таксономии
 *   `shared/utils/errorCodes.ts`. Если код не передан, поле в теле
 *   не появляется вовсе.
 *
 * ИЗВЕСТНАЯ ЛОВУШКА: `badRequest(res, errors, message?)` — второй аргумент
 * это `errors` (уходит в `body.errors`), а НЕ `message`. `message` — третий
 * аргумент, по умолчанию `'Bad Request.'`. Вызов
 * `badRequest(res, 'Неверный телефон')` положит строку в `body.errors`,
 * а `body.message` останется `'Bad Request.'`.
 */
export interface ApiResponseData {
   success: boolean;
   status_code: number;
   message: string;
   data?: any;
   errors?: any;
   error?: string; // Добавлено для детального сообщения об ошибке
   stack?: string; // Добавлено для stack trace (только в development)
   context?: any; // Добавлено для контекста ошибки (только в development)
   error_code?: ErrorCode; // Машиночитаемый код ошибки (аддитивно, опционально)
}

export const success = (
   res: Response,
   data: any,
   message: string = 'Success.',
   statusCode: number = 200,
): Response => {
   const response: ApiResponseData = {
      success: true,
      status_code: statusCode,
      message: message,
   };
   if (data !== null && data !== undefined) {
      response.data = data;
   }
   return res.status(statusCode).json(response);
};

/**
 * Единая точка формирования ошибочного ответа (см. контракт выше).
 *
 * Логирование: ошибка логируется РОВНО ОДИН РАЗ — здесь, на границе, и
 * только для 5xx (4xx пишет access-log уровнем warn вместе с телом ответа).
 * Промежуточные слои не логируют то, что пробрасывают.
 *
 * @param errorCode машиночитаемый код из таксономии; попадает в лог,
 *    в метрику app_errors_total и — аддитивно — в тело ответа полем
 *    `error_code`. Без него тело остаётся в прежней форме.
 * @param logContext доп. контекст только для лога (stack, operation, err) —
 *    в тело ответа НЕ попадает.
 */
export const error = (
   res: Response,
   message: string = 'An error occurred.',
   statusCode: number = 500,
   errors?: any,
   errorCode?: ErrorCode,
   logContext?: Record<string, unknown>,
): Response => {
   if (statusCode >= 400) {
      appErrorsTotal.inc({
         error_code: errorCode ?? 'UNCODED',
         status_code: String(statusCode),
      });
   }

   if (statusCode >= 500) {
      logger.error(
         {
            statusCode,
            message,
            errors,
            error_code: errorCode,
            requestId: (res as any).req?.id,
            method: (res as any).req?.method,
            url: (res as any).req?.url,
            userId: (res as any).req?.user?.id,
            ...logContext,
         },
         'Server error response',
      );
   }

   const response: ApiResponseData = {
      success: false,
      status_code: statusCode,
      message: message,
   };
   if (errors) {
      response.errors = errors;
   }
   if (errorCode) {
      response.error_code = errorCode;
   }
   return res.status(statusCode).json(response);
};

/**
 * ЛОВУШКА СИГНАТУРЫ: второй аргумент — `errors`, а не `message`.
 * `badRequest(res, 'текст')` кладёт строку в `body.errors`;
 * `body.message` останется `'Bad Request.'`. Сигнатуру не менять
 * (на неё завязаны существующие вызовы в модулях); при написании нового
 * кода передавайте message третьим аргументом осознанно.
 */
export const badRequest = (
   res: Response,
   errors?: any,
   message: string = 'Bad Request.',
): Response => {
   return error(res, message, 400, errors);
};

export const unauthorized = (
   res: Response,
   message: string = 'Authentication required.',
): Response => {
   return error(res, message, 401);
};

export const forbidden = (
   res: Response,
   message: string = 'Access denied.',
): Response => {
   return error(res, message, 403);
};

export const notFound = (
   res: Response,
   message: string = 'Resource not found.',
): Response => {
   return error(res, message, 404);
};

export const methodNotAllowed = (
   res: Response,
   message: string = 'Method Not Allowed.',
): Response => {
   return error(res, message, 405);
};

export const conflict = (
   res: Response,
   message: string = 'A resource with this identifier already exists.',
): Response => {
   return error(res, message, 409);
};

export const validationError = (
   res: Response,
   errors: any,
   message: string = 'Validation failed.',
): Response => {
   return error(res, message, 422, errors);
};

export const tooManyRequests = (
   res: Response,
   message: string = 'Too many requests, please try again later.',
): Response => {
   return error(res, message, 429);
};

export const internalError = (
   res: Response,
   message: string = 'An internal server error occurred.',
   errors?: any,
): Response => {
   const isProd = process.env.NODE_ENV === 'production';
   return error(res, message, 500, isProd ? undefined : errors);
};
