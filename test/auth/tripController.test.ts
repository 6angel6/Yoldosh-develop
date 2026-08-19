import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import { CarStatus } from '../../src/car/model/Car';
import * as testHelper from '../auth/test-helpers';

describe('Trips Module', () => {
   let driverToken: string;

   // beforeEach, не beforeAll: глобальный test/setup.ts TRUNCATE'ит все таблицы
   // перед каждым тестом — пользователь из beforeAll не дожил бы до первого it.
   beforeEach(async () => {
      const driverPhone = '+998991111111';
      await User.create({
         firstName: 'Test',
         lastName: 'Driver',
         phoneNumber: driverPhone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      driverToken = await testHelper.loginUser(driverPhone);
   });

   it('should allow a driver to add a new car', async () => {
      // Текущий контракт POST /car: поля createDriverApplicationSchema +
      // файлы licenseFront/techPassportFront/techPassportBack (multer.fields).
      const response = await request(app)
         .post('/api/v1/car')
         .set('Authorization', `Bearer ${driverToken}`)
         // licensePinfl/typeOfLicence обязательны на уровне БД
         // (driver_applications.license_pinfl NOT NULL).
         .field('licensePinfl', '12345678901234')
         .field('typeOfLicence', 'B')
         .field('govNumber', '01TEST123')
         .field('make', 'Chevrolet')
         .field('model', 'Cobalt')
         .field('color', 'white')
         .field('techPassportSerial', 'AC1234567')
         .field('issueDate', '15-06-2020')
         .field('seats', '4')
         .attach('licenseFront', Buffer.from('fake-image-data'), 'license.jpg')
         .attach(
            'techPassportFront',
            Buffer.from('fake-image-data'),
            'front.jpg',
         )
         .attach(
            'techPassportBack',
            Buffer.from('fake-image-data'),
            'back.jpg',
         );

      expect(response.status).toBe(201);
      expect(response.body.data.car).toHaveProperty('id');
      expect(response.body.data.car.govNumber).toBe('01TEST123');
      // Машина уходит на модерацию, а не одобряется сразу.
      expect(response.body.data.car.status).toBe(CarStatus.PENDING);
   });

   it('should reject adding a car without required document files', async () => {
      const response = await request(app)
         .post('/api/v1/car')
         .set('Authorization', `Bearer ${driverToken}`)
         // Тело валидно целиком: иначе Zod отсечёт запрос раньше, чем
         // контроллер дойдёт до проверки файлов, и тест перестанет
         // проверять то, ради чего написан.
         .field('licensePinfl', '12345678901234')
         .field('typeOfLicence', 'B')
         .field('govNumber', '01TEST999')
         .field('issueDate', '15-06-2020')
         .field('seats', '4');

      expect(response.status).toBe(400);
      // badRequest(res, <текст>) кладёт причину в errors, message — 'Bad Request.'
      expect(response.body.errors).toContain('Missing required document');
   });

   // POST /trip невозможно проверить герметично: tripCrudService.createTrip
   // геокодирует координаты через внешний Яндекс-геокодер (shared/utils/geoData).
   // Без сети/ключа тест всегда падал бы. Покрытие создания трипа живёт в
   // test/predictor/* (через репозиторий) и в интеграции импорта.
   it.skip('should allow a driver to create a new trip with their car (requires Yandex geocoder)', () => {
      // намеренно пропущен — внешняя зависимость
   });
});
