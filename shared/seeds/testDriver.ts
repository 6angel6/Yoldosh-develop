import db from '../config/database';
import logger from '../utils/logger';
import User, {
   Gender,
   NavigatorPreference,
   RegistrationSource,
   UserLanguage,
   UserRole,
} from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import Wallet, { CurrencyType } from '../../src/payment/models/Wallet';
import { Transaction } from 'sequelize';
import { randomUUID } from 'crypto';

/**
 * Очищенный сидер: Только Супер-драйвер и его машина
 */
const DEV_DRIVER_PHONE = '+998000000000';

export const DriverTestAccount = async () => {
   logger.info('Starting minimal seed for Super Driver...');

   let t: Transaction | null = null;

   try {
      t = await db.transaction();

      const [driver] = await User.findOrCreate({
         where: { phoneNumber: DEV_DRIVER_PHONE },
         defaults: {
            id: randomUUID(),
            firstName: 'Алишер',
            lastName: 'Гуломов',
            phoneNumber: DEV_DRIVER_PHONE,
            role: UserRole.Driver,
            verified: true,
            gender: Gender.Male,
            bio: 'Главный тестовый водитель приложения',
            rating: 4.9,
            talkative: true,
            music_allowed: true,
            pets_allowed: true,
            preferred_navigator: NavigatorPreference.YandexNavi,
            preferredLanguage: UserLanguage.Uzbek,
            passport_verified: true,
            registration_source: RegistrationSource.User,
         },
         transaction: t,
      });

      await driver.update(
         {
            role: UserRole.Driver,
            verified: true,
            passport_verified: true,
         },
         { transaction: t },
      );

      await Wallet.findOrCreate({
         where: { userId: driver.id },
         defaults: {
            userId: driver.id,
            balance: 1000000,
            currency: CurrencyType.UZS,
         },
         transaction: t,
      });

      await Car.destroy({
         where: { driver_id: driver.id },
         transaction: t,
      });

      await Car.create(
         {
            driver_id: driver.id,
            techPassportFrontPath: `/docs/techpassports/${driver.id}/front_0.jpg`,
            techPassportBackPath: `/docs/techpassports/${driver.id}/back_0.jpg`,
            govNumber: '01 AA 111 AA',
            make: 'Chevrolet',
            model: 'Cobalt',
            color: 'White',
            issueDate: new Date('2023-01-15'),
            techPassportSerial: 'TX12345',
            seats: 4,
            status: CarStatus.VERIFIED,
         },
         { transaction: t },
      );

      await t.commit();
      logger.info(
         'Minimal seed completed: dev driver +998000000000 and one verified car created.',
      );
   } catch (error) {
      if (t) await t.rollback();
      logger.error({ err: error }, 'Failed to seed minimal test data');
   }
};
