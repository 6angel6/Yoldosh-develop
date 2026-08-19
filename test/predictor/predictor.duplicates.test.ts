/**
 * Trip Predictor — гарантия «одна карточка на день, без дублей».
 *
 * Уникальный индекс uq_trips_predicted_day заводится миграцией, а не моделью,
 * поэтому db.sync() в test/setup.ts его не создаёт — здесь он досоздаётся явно
 * (SQL идентичен миграции 20260708120000), иначе бэкстоп остался бы непокрытым.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Op } from 'sequelize';
import db from '../../shared/config/database';
import { PREDICTION_CONFIG } from '../../shared/config/prediction';
import { predictor } from '../../src/trips/predictor';
import DriverPattern from '../../src/trips/predictor/models/DriverPattern';
import {
   addDays,
   uztDateString,
   uztDayRangeUTC,
} from '../../src/trips/predictor/timeUZT';
import Trip, {
   BookingType,
   GarageStatus,
   TripStatus,
} from '../../src/trips/models/Trip';
import User, { UserRole, RegistrationSource } from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import City from '../../src/city/models/City';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';

const departureAt = (dayOffset: number, minutes = 480): Date => {
   const { start } = uztDayRangeUTC(addDays(new Date(), dayOffset));
   return new Date(start.getTime() + minutes * 60 * 1000);
};

const ensureUniqueIndex = async () => {
   await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_predicted_day
         ON trips (driver_id, from_city_id, to_city_id,
                   ((timezone('Asia/Tashkent', departure_ts))::date))
         WHERE is_predicted = TRUE AND deleted_at IS NULL;
   `);
};

const seed = async () => {
   const cityA = await City.create({
      canonical_ru: 'Ташкент',
      canonical_uz: 'Toshkent',
      canonical_en: 'Tashkent',
      admin_level: 4,
      kind: 'city',
      center_geo: { type: 'Point', coordinates: [69.24, 41.31] },
   } as any);
   const cityB = await City.create({
      canonical_ru: 'Самарканд',
      canonical_uz: 'Samarqand',
      canonical_en: 'Samarkand',
      admin_level: 4,
      kind: 'city',
      center_geo: { type: 'Point', coordinates: [66.97, 39.65] },
   } as any);
   const driver = await User.create({
      firstName: 'D',
      phoneNumber: '+998900000011',
      role: UserRole.Driver,
      verified: true,
      registration_source: RegistrationSource.FromBot,
   } as any);
   const car = await Car.create({
      driver_id: driver.id,
      make: 'Chevrolet',
      model: 'Cobalt',
      govNumber: '01A111AA',
      seats: 4,
      status: CarStatus.VERIFIED,
      techPassportFrontPath: 'imported/placeholder',
      techPassportBackPath: 'imported/placeholder',
   } as any);
   return { cityA, cityB, driver, car };
};

const makeTrip = async (f: any, overrides: any = {}, createdAt?: Date) => {
   const trip = await Trip.create({
      driver_id: f.driver.id,
      car_id: f.car.id,
      from_city: 'Toshkent',
      to_city: 'Samarqand',
      from_city_id: f.cityA.id,
      to_city_id: f.cityB.id,
      from_latitude: 41.31,
      from_longitude: 69.24,
      to_latitude: 39.65,
      to_longitude: 66.97,
      from_address: '',
      to_address: '',
      booking_type: BookingType.request,
      departure_ts: departureAt(0),
      arrival_ts: null,
      duration: 240,
      seats_available: 4,
      price_per_person: 100000,
      max_two_back: false,
      garage: GarageStatus.Empty,
      status: TripStatus.Created,
      is_predicted: false,
      ...overrides,
   } as any);
   if (createdAt) {
      await db.query('UPDATE trips SET created_at = :ts WHERE id = :id', {
         replacements: { ts: createdAt.toISOString(), id: trip.id },
      });
   }
   return trip;
};

/** Дни (UZT) прогнозных трипов паттерна. */
const predictedDays = async (patternId: string): Promise<string[]> => {
   const rows = await Trip.findAll({
      where: { is_predicted: true, pattern_id: patternId },
      order: [['departure_ts', 'ASC']],
   });
   return rows.map((r) => uztDateString(new Date(r.departure_ts)));
};

const activate = async (f: any) => {
   const latest = await Trip.findOne({
      where: { driver_id: f.driver.id, is_predicted: false },
      order: [['createdAt', 'DESC']],
   });
   return db.transaction((t) =>
      predictor.updatePattern(
         {
            driverId: f.driver.id,
            fromCityId: f.cityA.id,
            toCityId: f.cityB.id,
            departureTs: new Date(latest!.departure_ts),
            carId: f.car.id,
            price: 100000,
            seats: 4,
            comment: null,
         },
         t,
      ),
   );
};

describe('PRODCHECK: одна карточка на день, без дублей', () => {
   let f: any;
   beforeEach(async () => {
      await ensureUniqueIndex();
      f = await seed();
   });

   it('2 трипа в 2 разных дня → паттерн active → ровно 7 прогнозов, по одному на каждый день', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());

      const pattern = await activate(f);
      expect(pattern!.status).toBe('active');

      const created = await predictor.generatePredictions(pattern!.id);
      expect(created).toBe(7);

      const days = await predictedDays(pattern!.id);
      expect(days.length).toBe(7);
      expect(new Set(days).size).toBe(7); // все дни РАЗНЫЕ

      const expected = Array.from({ length: 7 }, (_, i) =>
         uztDateString(addDays(new Date(), i + 1)),
      );
      expect(days).toEqual(expected); // завтра .. +7
   });

   it('уникальный индекс физически запрещает второй прогноз на тот же день', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());
      const pattern = await activate(f);
      await predictor.generatePredictions(pattern!.id);

      // Пытаемся вставить второй прогноз на завтра, другое время суток
      let err: any = null;
      try {
         await makeTrip(f, {
            departure_ts: departureAt(1, 1200),
            is_predicted: true,
            pattern_id: pattern!.id,
         });
      } catch (e) {
         err = e;
      }
      expect(err).not.toBeNull();
      expect(err.name).toBe('SequelizeUniqueConstraintError');
      expect(err.parent?.constraint).toBe('uq_trips_predicted_day');
   });

   it('параллельные генерации не создают дублей', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());
      const pattern = await activate(f);

      const results = await Promise.all([
         predictor.generatePredictions(pattern!.id),
         predictor.generatePredictions(pattern!.id),
         predictor.generatePredictions(pattern!.id),
      ]);
      const total = results.reduce((a, b) => a + b, 0);

      const days = await predictedDays(pattern!.id);
      expect(days.length).toBe(7);
      expect(new Set(days).size).toBe(7);
      expect(total).toBe(7);
   });

   it('если водитель уже опубликовал реальный трип на день — прогноз на этот день не создаётся', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());
      // Реальный трип на послезавтра (+2)
      await makeTrip(f, { departure_ts: departureAt(2) }, new Date());

      const pattern = await activate(f);
      const created = await predictor.generatePredictions(pattern!.id);
      expect(created).toBe(6);

      const days = await predictedDays(pattern!.id);
      expect(days).not.toContain(uztDateString(addDays(new Date(), 2)));

      // Итог: в день +2 у водителя ровно один активный трип на маршруте
      const { start, end } = uztDayRangeUTC(addDays(new Date(), 2));
      const cnt = await Trip.count({
         where: {
            driver_id: f.driver.id,
            from_city_id: f.cityA.id,
            to_city_id: f.cityB.id,
            status: TripStatus.Created,
            departure_ts: { [Op.gte]: start, [Op.lt]: end },
         },
      });
      expect(cnt).toBe(1);
   });

   it('повторная публикация того же трипа → повышение прогноза, а не второй трип', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());
      const pattern = await activate(f);
      await predictor.generatePredictions(pattern!.id);

      const tomorrow = departureAt(1, 540); // 09:00 вместо 08:00
      const promoted = await db.transaction(async (t) => {
         const match = await predictor.findMatchingPrediction(
            {
               driverId: f.driver.id,
               fromCityId: f.cityA.id,
               toCityId: f.cityB.id,
               departureTs: tomorrow,
            },
            t,
         );
         expect(match).not.toBeNull();
         return predictor.promotePrediction(
            match!,
            { departure_ts: tomorrow } as any,
            t,
         );
      });

      expect(promoted.is_predicted).toBe(false);

      const { start, end } = uztDayRangeUTC(addDays(new Date(), 1));
      const cnt = await Trip.count({
         where: {
            driver_id: f.driver.id,
            from_city_id: f.cityA.id,
            to_city_id: f.cityB.id,
            status: TripStatus.Created,
            departure_ts: { [Op.gte]: start, [Op.lt]: end },
         },
      });
      expect(cnt).toBe(1); // ровно одна карточка на завтра
   });

   it('БРОНЬ на прогнозе: повышение не должно сбрасывать seats_available', async () => {
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      await makeTrip(f, { departure_ts: departureAt(0) }, new Date());
      const pattern = await activate(f);
      await predictor.generatePredictions(pattern!.id);

      const tomorrow = departureAt(1);
      const pred = await Trip.findOne({
         where: { is_predicted: true, pattern_id: pattern!.id },
         order: [['departure_ts', 'ASC']],
      });
      // Пассажир забронировал 2 места из 4 → счётчик свободных мест уменьшился
      const passenger = await User.create({
         firstName: 'P',
         phoneNumber: '+998900000022',
         role: UserRole.Passenger,
         registration_source: RegistrationSource.FromBot,
      } as any);
      await Booking.create({
         tripId: pred!.id,
         passengerId: passenger.id,
         seatsBooked: 2,
         totalPrice: 200000,
         status: BookingStatus.CONFIRMED,
      } as any);
      await pred!.update({ seats_available: 2 });

      await db.transaction(async (t) => {
         const match = await predictor.findMatchingPrediction(
            {
               driverId: f.driver.id,
               fromCityId: f.cityA.id,
               toCityId: f.cityB.id,
               departureTs: tomorrow,
            },
            t,
         );
         // Импорт кладёт в tripData seats_available из объявления парсера (4)
         return predictor.promotePrediction(
            match!,
            { departure_ts: tomorrow, seats_available: 4 } as any,
            t,
         );
      });

      const after = await Trip.findByPk(pred!.id);
      expect(after!.seats_available).toBe(2); // 2 места уже заняты бронью
   });

   it('второй раз в тот же день публикации → паттерн НЕ активируется (нужны 2 разных дня)', async () => {
      await makeTrip(f, { departure_ts: departureAt(1) }, new Date());
      await makeTrip(f, { departure_ts: departureAt(2) }, new Date());
      const pattern = await activate(f);
      expect(pattern!.status).toBe('candidate');
      expect(await predictor.generatePredictions(pattern!.id)).toBe(0);
      expect(await DriverPattern.count({ where: { status: 'active' } })).toBe(
         0,
      );
   });
});
