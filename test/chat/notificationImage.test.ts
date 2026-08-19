import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import Notification, {
   NotificationType,
} from '../../src/chat/models/Notification';
import { loginUser } from '../auth/test-helpers';

/**
 * Опциональное поле image (URL картинки) на уведомлении: должно
 * сохраняться и возвращаться в GET /notification. Когда картинки нет —
 * приходит null, старый контракт не ломается.
 */
describe('Notification.image (опциональная картинка)', () => {
   const phone = '+998994444444';
   let token: string;
   let userId: string;

   beforeEach(async () => {
      const user = await User.create({
         firstName: 'Img',
         lastName: 'Tester',
         phoneNumber: phone,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      userId = user.id;
      token = await loginUser(phone);
   });

   it('сохраняет image и отдаёт его в GET /notification', async () => {
      const url = 'https://cdn.example.com/promo.jpg';
      await Notification.create({
         userId,
         title: 'С картинкой',
         message: 'promo',
         type: NotificationType.PROMOTION_AND_DISCOUNTS,
         image: url,
      } as any);

      const res = await request(app)
         .get('/api/v1/notification')
         .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const list = res.body.data.notifications;
      expect(list).toHaveLength(1);
      expect(list[0].image).toBe(url);
   });

   it('без картинки image = null, контракт не ломается', async () => {
      await Notification.create({
         userId,
         title: 'Без картинки',
         message: 'plain',
         type: NotificationType.GENERAL,
      } as any);

      const res = await request(app)
         .get('/api/v1/notification')
         .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const list = res.body.data.notifications;
      expect(list).toHaveLength(1);
      expect(list[0].image).toBeNull();
   });
});
