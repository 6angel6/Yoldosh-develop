import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/main';

/**
 * registerAndloginStep бросал голый `throw new Error(...)` при отсутствии
 * пользователя — это уходило клиенту как 500. Теперь причина маскируется
 * тем же ответом, что и неверный OTP: клиент не должен различать
 * «нет такого номера» и «неверный код».
 */
describe('Auth: verify-otp без запроса кода', () => {
   it('возвращает 400 с маскированной причиной, а не 500', async () => {
      const response = await request(app)
         .post('/api/v1/auth/verify-otp')
         .send({ phoneNumber: '+998909998877', otp: '0000' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      // Тот же текст, что и при неверном OTP — причина не раскрывается.
      expect(response.body.errors).toBe('Invalid OTP or login failed.');
   });
});
