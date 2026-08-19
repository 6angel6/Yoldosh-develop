import { describe, expect, it } from 'vitest';
import {
   createCarApplicationSchema,
   createDriverApplicationSchema,
} from '../../src/car/model/dto/createDriverApplicationDto';

/**
 * `driver_applications.license_pinfl` объявлен NOT NULL. Если Zod пропускает
 * запрос без этого поля, до БД доходит нарушение констрейнта и клиент
 * получает 500 вместо 400.
 */
const validPayload = {
   licensePinfl: '12345678901234',
   typeOfLicence: 'B',
   govNumber: '01A123BC',
   make: 'Chevrolet',
   model: 'Cobalt',
   color: 'white',
   techPassportSerial: 'AAA1234567',
   issueDate: '01-01-2020',
   seats: '4',
};

describe('DTO заявки водителя против DDL', () => {
   it('создание отклоняет payload без licensePinfl', () => {
      const { licensePinfl: _omitted, ...withoutPinfl } = validPayload;

      const result = createCarApplicationSchema.safeParse(withoutPinfl);

      expect(result.success).toBe(false);
   });

   it('создание принимает полный payload', () => {
      const result = createCarApplicationSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
   });

   it('создание проверяет длину licensePinfl (колонка STRING(14))', () => {
      const result = createCarApplicationSchema.safeParse({
         ...validPayload,
         licensePinfl: '123',
      });

      expect(result.success).toBe(false);
   });

   it('резабмит по-прежнему допускает пропуск licensePinfl', () => {
      // Сервис подставит значение из существующей машины.
      const { licensePinfl: _omitted, ...withoutPinfl } = validPayload;

      const result = createDriverApplicationSchema.safeParse(withoutPinfl);

      expect(result.success).toBe(true);
   });
});
