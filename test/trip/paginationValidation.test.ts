import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import { loginUser } from '../auth/test-helpers';

/**
 * Пагинация читалась как parseInt(query.limit || '10'): 'abc' превращался в NaN,
 * доезжал до Sequelize и возвращался как 500. Верхней границы не было вовсе.
 */
describe('Валидация пагинации', () => {
   const phone = '+998994444444';
   let token: string;

   beforeEach(async () => {
      await User.create({
         firstName: 'Test',
         lastName: 'Driver',
         phoneNumber: phone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      token = await loginUser(phone);
   });

   it('нечисловой limit возвращает 400, а не 500', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity?role=driver&limit=abc')
         .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
   });

   it('limit сверх верхней границы возвращает 400', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity?role=driver&limit=100000')
         .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
   });

   it('page = 0 возвращает 400', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity?role=driver&page=0')
         .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
   });

   it('корректная пагинация по-прежнему работает', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity?role=driver&page=1&limit=10')
         .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
   });

   it('пагинация без параметров использует дефолты', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity?role=driver')
         .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
   });
});
