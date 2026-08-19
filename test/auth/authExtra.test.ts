/**
 * Дополнительные сценарии auth: повторный запрос OTP и refresh-token
 * с недействительными токенами. Фиксируем текущее поведение — ни один
 * из сценариев не должен отвечать 500.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/main';
import User from '../../src/user/models/User';

describe('Auth: повторный request-otp', () => {
   const phoneNumber = '+998905550011';

   it('два запроса подряд для одного номера — оба 200, пользователь один', async () => {
      const first = await request(app)
         .post('/api/v1/auth/request-otp')
         .send({ phoneNumber });

      const second = await request(app)
         .post('/api/v1/auth/request-otp')
         .send({ phoneNumber });

      // Текущее поведение: rate-limit на этом роуте нет, оба запроса успешны
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.message).toBe('OTP sent successfully.');
      expect(second.body.message).toBe('OTP sent successfully.');

      // Повторный запрос не плодит дубликаты пользователя
      expect(await User.count({ where: { phoneNumber } })).toBe(1);

      // OTP по-прежнему рабочий после повторной отправки
      const verify = await request(app)
         .post('/api/v1/auth/verify-otp')
         .send({ phoneNumber, otp: '0000' });
      expect(verify.status).toBe(200);
   });
});

describe('Auth: refresh-token с недействительным токеном', () => {
   it('мусорный (не-JWT) токен в cookie — 401, не 500', async () => {
      const response = await request(app)
         .post('/api/v1/auth/refresh-token')
         .set('Cookie', 'refresh-token=definitely-not-a-jwt');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.status_code).toBe(401);
      expect(response.body.message).toBe('Refresh token is not valid');
   });

   it('JWT, подписанный чужим секретом — 401, не 500', async () => {
      const forged = jwt.sign({ id: 'some-user-id' }, 'wrong-secret', {
         expiresIn: '30d',
      });

      const response = await request(app)
         .post('/api/v1/auth/refresh-token')
         .set('Cookie', `refresh-token=${forged}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Refresh token is not valid');
   });

   it('протухший, но корректно подписанный токен — 401, не 500', async () => {
      const user = await User.create({
         firstName: 'Expired',
         lastName: 'Token',
         phoneNumber: '+998905550022',
         verified: true,
      } as any);

      // Тот же секрет, что использует generateRefreshToken, но срок истёк
      const expired = jwt.sign(
         { id: user.id },
         process.env.JWT_REFRESH_SECRET as string,
         { expiresIn: '-10s' },
      );

      const response = await request(app)
         .post('/api/v1/auth/refresh-token')
         .set('Cookie', `refresh-token=${expired}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Refresh token is not valid');
   });
});
