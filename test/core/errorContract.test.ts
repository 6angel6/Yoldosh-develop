import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { handleControllerError } from '../../shared/utils/controllerErrorHandler';
import {
   AppError,
   ConflictError,
   NotFoundError,
} from '../../shared/utils/errorHandler';
import { ErrorCode } from '../../shared/utils/errorCodes';
import * as apiResponse from '../../shared/utils/apiResponse';
import { appErrorsTotal } from '../../shared/utils/appMetrics';
import logger from '../../shared/utils/logger';

type Body = Record<string, unknown>;

interface MockRes {
   statusCode: number;
   body: Body | undefined;
   status(code: number): MockRes;
   json(payload: Body): MockRes;
}

const createRes = (): MockRes => ({
   statusCode: 0,
   body: undefined,
   status(code: number) {
      this.statusCode = code;
      return this;
   },
   json(payload: Body) {
      this.body = payload;
      return this;
   },
});

const asExpressRes = (res: MockRes): Response => res as unknown as Response;

afterEach(() => {
   vi.restoreAllMocks();
});

describe('контракт ошибки: поле error_code', () => {
   it('AppError с code: в теле появляется error_code, существующие поля на месте', () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const res = createRes();

      handleControllerError(
         asExpressRes(res),
         new ConflictError(
            'Seats are not available',
            ErrorCode.BOOKING_SEATS_UNAVAILABLE,
         ),
         { operation: 'test.operation' },
      );

      expect(res.statusCode).toBe(409);
      const body = res.body as Body;
      expect(body.success).toBe(false);
      expect(body.status_code).toBe(409);
      expect(body.message).toBe('Seats are not available');
      expect(body.error_code).toBe('BOOKING_SEATS_UNAVAILABLE');
   });

   it('AppError без code: error_code в теле не появляется вовсе, форма прежняя', () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const res = createRes();

      handleControllerError(
         asExpressRes(res),
         new NotFoundError('Trip not found'),
         {
            operation: 'test.operation',
         },
      );

      expect(res.statusCode).toBe(404);
      const body = res.body as Body;
      expect(body.success).toBe(false);
      expect(body.status_code).toBe(404);
      expect(body.message).toBe('Trip not found');
      expect(body).not.toHaveProperty('error_code');
   });

   it('code уходит в метрику app_errors_total', async () => {
      // 4xx больше не логируется в apiResponse (лог один — access-log);
      // машиночитаемый код теперь уходит в метрику ошибок
      const res = createRes();

      handleControllerError(
         asExpressRes(res),
         new ConflictError(
            'Seats are not available',
            ErrorCode.BOOKING_SEATS_UNAVAILABLE,
         ),
         { operation: 'test.operation' },
      );

      const metric = await appErrorsTotal.get();
      const counted = metric.values.some(
         (v) =>
            v.labels.error_code === 'BOOKING_SEATS_UNAVAILABLE' &&
            v.labels.status_code === '409' &&
            v.value >= 1,
      );
      expect(counted).toBe(true);
   });

   it('5xx логируется один раз со stack и operation', () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const res = createRes();

      handleControllerError(
         asExpressRes(res),
         new Error('boom'),
         { operation: 'test.operation' },
         'Fallback message.',
      );

      const calls = errorSpy.mock.calls.filter(([first]) => {
         return (
            typeof first === 'object' &&
            first !== null &&
            (first as { operation?: unknown }).operation === 'test.operation'
         );
      });
      expect(calls).toHaveLength(1);
      expect((calls[0][0] as { stack?: unknown }).stack).toBeDefined();
   });

   it('существующие конструкторы работают без нового аргумента', () => {
      const withoutCode = new ConflictError('msg');
      expect(withoutCode.statusCode).toBe(409);
      expect(withoutCode.code).toBeUndefined();

      const base = new AppError('msg', 418);
      expect(base.statusCode).toBe(418);
      expect(base.code).toBeUndefined();

      const withCode = new AppError(
         'msg',
         503,
         ErrorCode.GEO_SERVICE_UNAVAILABLE,
      );
      expect(withCode.code).toBe(ErrorCode.GEO_SERVICE_UNAVAILABLE);
   });
});

describe('контракт apiResponse', () => {
   it('error(): error_code аддитивен и появляется только при переданном коде', () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const resWith = createRes();
      apiResponse.error(
         asExpressRes(resWith),
         'Invalid transition',
         400,
         undefined,
         ErrorCode.TRIP_INVALID_TRANSITION,
      );
      const bodyWith = resWith.body as Body;
      expect(bodyWith).toEqual({
         success: false,
         status_code: 400,
         message: 'Invalid transition',
         error_code: 'TRIP_INVALID_TRANSITION',
      });

      const resWithout = createRes();
      apiResponse.error(asExpressRes(resWithout), 'Invalid transition', 400);
      expect(resWithout.body).toEqual({
         success: false,
         status_code: 400,
         message: 'Invalid transition',
      });
   });

   it('ловушка badRequest: второй аргумент — это errors, а не message', () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const res = createRes();

      apiResponse.badRequest(asExpressRes(res), 'Какой-то текст');

      const body = res.body as Body;
      expect(body.errors).toBe('Какой-то текст');
      expect(body.message).toBe('Bad Request.');
   });
});
