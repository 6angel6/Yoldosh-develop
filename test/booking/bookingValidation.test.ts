import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import { loginUser } from '../auth/test-helpers';

/**
 * Роуты booking принимают `:bookingId` без валидации: строка вроде 'abc'
 * доезжает до Postgres, падает на типе uuid и возвращается клиенту как 500.
 * Кривой вход обязан давать 400.
 */
describe('Booking: валидация пути и тела', () => {
   const driverPhone = '+998992222222';
   let driverToken: string;

   beforeEach(async () => {
      await User.create({
         firstName: 'Test',
         lastName: 'Driver',
         phoneNumber: driverPhone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      driverToken = await loginUser(driverPhone);
   });

   const cases: Array<[string, 'get' | 'patch' | 'post', string]> = [
      ['GET /booking/:bookingId', 'get', '/api/v1/booking/abc'],
      ['PATCH /booking/:bookingId', 'patch', '/api/v1/booking/abc'],
      [
         'PATCH /booking/:bookingId/cancel',
         'patch',
         '/api/v1/booking/abc/cancel',
      ],
      [
         'POST /booking/:bookingId/confirm',
         'post',
         '/api/v1/booking/abc/confirm',
      ],
      ['POST /booking/:bookingId/reject', 'post', '/api/v1/booking/abc/reject'],
   ];

   for (const [name, method, url] of cases) {
      it(`${name} с невалидным uuid возвращает 400, а не 500`, async () => {
         const response = await request(app)
            [method](url)
            .set('Authorization', `Bearer ${driverToken}`)
            .send({});

         expect(response.status).toBe(400);
         expect(response.body.success).toBe(false);
      });
   }

   it('POST /booking с мусорным телом возвращает 400, а не 500', async () => {
      const response = await request(app)
         .post('/api/v1/booking')
         .set('Authorization', `Bearer ${driverToken}`)
         .send({ a: 1 });

      expect(response.status).toBe(400);
   });
});
