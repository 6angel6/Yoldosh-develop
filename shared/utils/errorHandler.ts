import { ErrorCode } from './errorCodes';

export class AppError extends Error {
   public readonly statusCode: number;
   /**
    * Машиночитаемый код из таксономии (`shared/utils/errorCodes.ts`).
    * Необязателен: без него ответ уходит в прежней форме, без `error_code`.
    */
   public readonly code?: ErrorCode;

   constructor(message: string, statusCode: number, code?: ErrorCode) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      // Это позволяет корректно работать instanceof
      Object.setPrototypeOf(this, new.target.prototype);
   }
}

export class BadRequestError extends AppError {
   constructor(message: string = 'Bad Request', code?: ErrorCode) {
      super(message, 400, code);
   }
}

export class UnauthorizedError extends AppError {
   constructor(message: string = 'Unauthorized', code?: ErrorCode) {
      super(message, 401, code);
   }
}

export class ForbiddenError extends AppError {
   constructor(message: string = 'Forbidden', code?: ErrorCode) {
      super(message, 403, code);
   }
}

export class NotFoundError extends AppError {
   constructor(message: string = 'Not Found', code?: ErrorCode) {
      super(message, 404, code);
   }
}

export class ConflictError extends AppError {
   constructor(message: string = 'Conflict', code?: ErrorCode) {
      super(message, 409, code);
   }
}

export class InternalServerError extends AppError {
   constructor(message: string = 'Internal Server Error', code?: ErrorCode) {
      super(message, 500, code);
   }
}

export class ServiceUnavailableError extends AppError {
   constructor(message: string = 'Service Unavailable', code?: ErrorCode) {
      super(message, 503, code);
   }
}

export class PaynetError extends Error {
   public code: number;
   constructor(message: string, code: number) {
      super(message);
      this.code = code;
   }
}
