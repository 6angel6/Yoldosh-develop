import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { handleControllerError } from '../../shared/utils/controllerErrorHandler';
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

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
   process.env.NODE_ENV = originalNodeEnv;
   vi.restoreAllMocks();
});

describe('handleControllerError: неожиданные ошибки и NODE_ENV', () => {
   it('production: клиент получает только generic-сообщение, без stack и внутреннего текста', () => {
      process.env.NODE_ENV = 'production';
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const res = createRes();

      handleControllerError(
         asExpressRes(res),
         new Error('internal-secret-detail'),
         { operation: 'test.operation' },
      );

      expect(res.statusCode).toBe(500);
      const body = res.body as Body;
      expect(body.success).toBe(false);
      expect(body.status_code).toBe(500);
      expect(body.message).toBe(
         'An unexpected error occurred. Please try again.',
      );
      // Никаких деталей клиенту: ни stack, ни внутреннего сообщения, ни контекста.
      expect(body).not.toHaveProperty('errors');
      expect(body).not.toHaveProperty('stack');
      expect(body).not.toHaveProperty('error');
      expect(body).not.toHaveProperty('context');
      expect(JSON.stringify(body)).not.toContain('internal-secret-detail');
   });

   it('production: детали ошибки при этом попадают в лог', () => {
      process.env.NODE_ENV = 'production';
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const res = createRes();
      const boom = new Error('boom-log-detail');

      handleControllerError(asExpressRes(res), boom, {
         operation: 'test.operation',
      });

      const loggedWithError = errorSpy.mock.calls.some(([first]) => {
         return (
            typeof first === 'object' &&
            first !== null &&
            (first as { err?: unknown }).err === boom
         );
      });
      expect(loggedWithError).toBe(true);
   });

   it('development: детали ошибки присутствуют в ответе', () => {
      process.env.NODE_ENV = 'development';
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const res = createRes();

      handleControllerError(asExpressRes(res), new Error('dev-detail'), {
         operation: 'test.operation',
      });

      expect(res.statusCode).toBe(500);
      const body = res.body as Body;
      expect(body.success).toBe(false);
      expect(body.status_code).toBe(500);
      const errors = body.errors as Body;
      expect(errors).toBeDefined();
      expect(errors.error).toBe('dev-detail');
      expect(typeof errors.stack).toBe('string');
   });
});
