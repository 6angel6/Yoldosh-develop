import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import { loginUser } from '../auth/test-helpers';

/**
 * Path-параметры уходили в Postgres без проверки: строка 'abc' падала на типе
 * uuid и возвращалась клиенту как 500. Контроллеры теперь разбирают их Zod-схемой,
 * а handleControllerError маппит ZodError в 400.
 */
describe('Валидация path-параметров', () => {
   const driverPhone = '+998993333333';
   let token: string;

   beforeEach(async () => {
      await User.create({
         firstName: 'Test',
         lastName: 'Driver',
         phoneNumber: driverPhone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      token = await loginUser(driverPhone);
   });

   const authed: Array<[string, 'get' | 'patch' | 'post' | 'delete', string]> =
      [
         ['GET /trip/:tripId', 'get', '/api/v1/trip/abc'],
         ['GET /trip/:tripId/bookings', 'get', '/api/v1/trip/abc/bookings'],
         ['PATCH /trip/:tripId', 'patch', '/api/v1/trip/abc'],
         ['PATCH /trip/:tripId/cancel', 'patch', '/api/v1/trip/abc/cancel'],
         ['POST /trip/:tripId/start', 'post', '/api/v1/trip/abc/start'],
         ['POST /trip/:tripId/complete', 'post', '/api/v1/trip/abc/complete'],
         ['GET /car/:id', 'get', '/api/v1/car/abc'],
         ['DELETE /car/:id', 'delete', '/api/v1/car/abc'],
         ['GET /chat/:chatId/messages', 'get', '/api/v1/chat/abc/messages'],
         [
            'PATCH /notification/:notificationId/read',
            'patch',
            '/api/v1/notification/abc/read',
         ],
      ];

   for (const [name, method, url] of authed) {
      it(`${name} с невалидным uuid возвращает 400, а не 500`, async () => {
         const response = await request(app)
            [method](url)
            .set('Authorization', `Bearer ${token}`)
            .send({});

         expect(response.status).toBe(400);
         expect(response.body.success).toBe(false);
      });
   }

   const anonymous: Array<[string, string]> = [
      ['GET /user/:id', '/api/v1/user/abc'],
      ['GET /ratings/:userId', '/api/v1/ratings/abc'],
      ['GET /public/trips/details/:tripId', '/api/v1/public/trips/details/abc'],
   ];

   for (const [name, url] of anonymous) {
      it(`${name} с невалидным uuid возвращает 400, а не 500`, async () => {
         const response = await request(app).get(url);

         expect(response.status).toBe(400);
      });
   }

   it('POST /user/block-user с невалидным userId в теле возвращает 400', async () => {
      const response = await request(app)
         .post('/api/v1/user/block-user')
         .set('Authorization', `Bearer ${token}`)
         .send({ userId: 'abc' });

      expect(response.status).toBe(400);
   });
});
