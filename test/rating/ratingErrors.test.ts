import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/main';
import User from '../../src/user/models/User';
import { loginUser } from '../auth/test-helpers';

/**
 * Бизнес-ошибки rating раньше бросались голым `throw new Error(...)` и уходили
 * клиенту как 500. Проверяем, что теперь это доменные 4xx с error_code.
 */
describe('Rating: доменные ошибки вместо 500', () => {
   const raterPhone = '+998901110001';
   const ratedPhone = '+998901110002';

   let raterId: string;
   let raterToken: string;

   beforeEach(async () => {
      const rater = await User.create({
         firstName: 'Rater',
         lastName: 'User',
         phoneNumber: raterPhone,
         verified: true,
      });
      raterId = rater.id;
      raterToken = await loginUser(raterPhone);
   });

   it('самооценка возвращает 400, а не 500', async () => {
      const response = await request(app)
         .post('/api/v1/ratings')
         .set('Authorization', `Bearer ${raterToken}`)
         .send({
            tripId: '11111111-1111-4111-8111-111111111111',
            ratedUserId: raterId,
            rating: 5,
         });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.status_code).toBe(400);
      expect(response.body.message).toBe('Users cannot rate themselves.');
      expect(response.body.error_code).toBe('RATING_SELF_NOT_ALLOWED');
   });

   it('оценка несуществующего трипа возвращает 404, а не 500', async () => {
      const rated = await User.create({
         firstName: 'Rated',
         lastName: 'User',
         phoneNumber: ratedPhone,
         verified: true,
      });

      const response = await request(app)
         .post('/api/v1/ratings')
         .set('Authorization', `Bearer ${raterToken}`)
         .send({
            tripId: '22222222-2222-4222-8222-222222222222',
            ratedUserId: rated.id,
            rating: 5,
         });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Trip not found.');
      expect(response.body.error_code).toBe('TRIP_NOT_FOUND');
   });
});
