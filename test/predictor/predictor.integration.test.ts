/**
 * Интеграционные тесты Trip Predictor (Этап 1) — против реальной PostgreSQL.
 *
 * Требуют настроенной тестовой БД (TEST_DB_* в .env). Запуск: `npm test`.
 * Глобальный test/setup.ts делает db.sync({ force:true }) (таблицы из моделей,
 * включая driver_patterns/prediction_log и новые колонки trips) и truncate
 * перед каждым тестом.
 *
 * Логику предиктора драйвим напрямую (updatePattern/generatePredictions/
 * reconcile/runDaily), минуя importTripFromExternal — чтобы не зависеть от
 * геокодера городов и гео-триггера fill_trip_geo_fields (последнего нет при
 * db.sync). Все трипы создаём с явными from_city_id/to_city_id.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Op } from 'sequelize';
import db from '../../shared/config/database';
import { PREDICTION_CONFIG } from '../../shared/config/prediction';
import { predictor } from '../../src/trips/predictor';
import DriverPattern from '../../src/trips/predictor/models/DriverPattern';
import PredictionLog from '../../src/trips/predictor/models/PredictionLog';
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

// 08:00 UZT (480 мин от полуночи) на UZT-дне (сегодня + offset дней), в UTC.
const departureAt = (dayOffset: number, minutes = 480): Date => {
   const { start } = uztDayRangeUTC(addDays(new Date(), dayOffset));
   return new Date(start.getTime() + minutes * 60 * 1000);
};

interface Fixtures {
   cityA: City;
   cityB: City;
   driver: User;
   car: Car;
}

const seedFixtures = async (): Promise<Fixtures> => {
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
      firstName: 'Regular',
      phoneNumber: '+998901112233',
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

const makeTrip = async (
   f: Fixtures,
   overrides: Partial<any>,
   createdAt?: Date,
): Promise<Trip> => {
   const trip = await Trip.create({
      driver_id: f.driver.id,
      car_id: f.car.id,
      from_city: f.cityA.canonical_uz,
      to_city: f.cityB.canonical_uz,
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
      // Backdate created_at (Sequelize ставит now() на create) — окно 3/7
      // считается по РАЗНЫМ дням публикации.
      await db.query('UPDATE trips SET created_at = :ts WHERE id = :id', {
         replacements: { ts: createdAt.toISOString(), id: trip.id },
      });
   }
   return trip;
};

const makePattern = async (f: Fixtures, overrides: Partial<any> = {}) => {
   const today = uztDateString(new Date());
   return DriverPattern.create({
      driver_id: f.driver.id,
      from_city_id: f.cityA.id,
      to_city_id: f.cityB.id,
      departure_time: 480,
      time_tolerance: PREDICTION_CONFIG.TIME_TOLERANCE_MIN,
      recent_departure_min: [480],
      price: 100000,
      seats: 4,
      car_id: f.car.id,
      occurrences: 3,
      window_occurrences: 3,
      first_seen: today,
      last_seen: today,
      confidence: 0.8,
      status: 'active',
      ...overrides,
   } as any);
};

describe('Trip Predictor — integration', () => {
   let f: Fixtures;
   beforeEach(async () => {
      f = await seedFixtures();
   });

   it('activates a pattern after 3 real trips in 7 days and generates the horizon', async () => {
      // 3 реальных трипа на одном маршруте ~08:00 в 3 РАЗНЫХ дня публикации
      await makeTrip(
         f,
         { departure_ts: departureAt(-2) },
         addDays(new Date(), -2),
      );
      await makeTrip(
         f,
         { departure_ts: departureAt(-1) },
         addDays(new Date(), -1),
      );
      const latest = await makeTrip(
         f,
         { departure_ts: departureAt(0) },
         new Date(),
      );

      const pattern = await db.transaction((t) =>
         predictor.updatePattern(
            {
               driverId: f.driver.id,
               fromCityId: f.cityA.id,
               toCityId: f.cityB.id,
               departureTs: new Date(latest.departure_ts),
               carId: f.car.id,
               price: 100000,
               seats: 4,
               comment: null,
            },
            t,
         ),
      );

      expect(pattern).not.toBeNull();
      expect(pattern!.status).toBe('active');
      expect(pattern!.window_occurrences).toBe(3);
      expect(Number(pattern!.confidence)).toBeGreaterThanOrEqual(
         PREDICTION_CONFIG.CONFIDENCE_THRESHOLD,
      );

      const created = await predictor.generatePredictions(pattern!.id);
      expect(created).toBe(PREDICTION_CONFIG.HORIZON_DAYS);

      const predictedCount = await Trip.count({
         where: { is_predicted: true, pattern_id: pattern!.id },
      });
      expect(predictedCount).toBe(PREDICTION_CONFIG.HORIZON_DAYS);

      const anyPredicted = await Trip.findOne({
         where: { is_predicted: true, pattern_id: pattern!.id },
      });
      expect(anyPredicted!.source_trip_id).toBe(latest.id);
      expect(anyPredicted!.driver_id).toBe(f.driver.id);

      const pendingLogs = await PredictionLog.count({
         where: { pattern_id: pattern!.id, outcome: 'pending' },
      });
      expect(pendingLogs).toBe(PREDICTION_CONFIG.HORIZON_DAYS);

      // Идемпотентность: повторная генерация не создаёт дублей
      const again = await predictor.generatePredictions(pattern!.id);
      expect(again).toBe(0);
      const stillCount = await Trip.count({
         where: { is_predicted: true, pattern_id: pattern!.id },
      });
      expect(stillCount).toBe(PREDICTION_CONFIG.HORIZON_DAYS);
   });

   it('is regular by route in 2 different days regardless of departure time', async () => {
      // Два трипа на одном маршруте в 2 РАЗНЫХ дня и в РАЗНОЕ время (08:00 и 20:00).
      // Время опционально → оба дня засчитываются, порог 2 достигнут.
      await makeTrip(
         f,
         { departure_ts: departureAt(-1, 480) },
         addDays(new Date(), -1),
      );
      const latest = await makeTrip(
         f,
         { departure_ts: departureAt(0, 1200) },
         new Date(),
      );

      const pattern = await db.transaction((t) =>
         predictor.updatePattern(
            {
               driverId: f.driver.id,
               fromCityId: f.cityA.id,
               toCityId: f.cityB.id,
               departureTs: new Date(latest.departure_ts),
               carId: f.car.id,
               price: 100000,
               seats: 4,
               comment: null,
            },
            t,
         ),
      );

      expect(pattern!.status).toBe('active');
      expect(pattern!.window_occurrences).toBe(2);
   });

   it('keeps a one-off driver as candidate (no predictions)', async () => {
      const trip = await makeTrip(
         f,
         { departure_ts: departureAt(0) },
         new Date(),
      );

      const pattern = await db.transaction((t) =>
         predictor.updatePattern(
            {
               driverId: f.driver.id,
               fromCityId: f.cityA.id,
               toCityId: f.cityB.id,
               departureTs: new Date(trip.departure_ts),
               carId: f.car.id,
               price: 100000,
               seats: 4,
               comment: null,
            },
            t,
         ),
      );

      expect(pattern!.status).toBe('candidate');
      expect(pattern!.window_occurrences).toBe(1);

      const created = await predictor.generatePredictions(pattern!.id);
      expect(created).toBe(0);
   });

   it('promotes a matching prediction in place (same id), keeps bookings, logs confirmed', async () => {
      const pattern = await makePattern(f);
      const source = await makeTrip(
         f,
         { departure_ts: departureAt(0) },
         new Date(),
      );

      const tomorrow = departureAt(1);
      const predicted = await makeTrip(f, {
         departure_ts: tomorrow,
         is_predicted: true,
         pattern_id: pattern.id,
         source_trip_id: source.id,
         prediction_confidence: 0.8,
         predicted_at: new Date(),
         price_per_person: 90000,
      });
      await PredictionLog.create({
         pattern_id: pattern.id,
         predicted_trip: predicted.id,
         target_date: uztDateString(tomorrow),
      } as any);

      // Пассажир забронировал прогноз ДО подтверждения
      const passenger = await User.create({
         firstName: 'Passenger',
         phoneNumber: '+998907776655',
         role: UserRole.Passenger,
         verified: true,
      } as any);
      const booking = await Booking.create({
         tripId: predicted.id,
         passengerId: passenger.id,
         totalPrice: 90000,
         status: BookingStatus.PENDING,
      } as any);

      // Симулируем приём реального трипа на завтра (как в импорте): находим
      // прогноз и «повышаем» его на месте с обновлёнными данными объявления.
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
         expect(match).not.toBeNull();
         expect(match!.id).toBe(predicted.id);

         await predictor.promotePrediction(
            match!,
            { price_per_person: 120000, seats_available: 4 } as any,
            t,
         );
      });

      // Тот же трип: НЕ удалён, метка снята, цена обновлена
      const promoted = await Trip.findByPk(predicted.id);
      expect(promoted).not.toBeNull();
      expect(promoted!.is_predicted).toBe(false);
      expect(Number(promoted!.price_per_person)).toBe(120000);

      // Бронь осталась на том же трипе (id не менялся) — перепривязка не нужна
      const bookingAfter = await Booking.findByPk(booking.id);
      expect(bookingAfter!.tripId).toBe(predicted.id);

      // Лог подтверждён тем же трипом
      const log = await PredictionLog.findOne({
         where: { predicted_trip: predicted.id },
      });
      expect(log!.outcome).toBe('confirmed');
      expect(log!.confirmed_trip).toBe(predicted.id);
      expect(log!.resolved_at).not.toBeNull();
   });

   it('dedup excludes predictions (Р2): predicted trip is not seen as a duplicate', async () => {
      const pattern = await makePattern(f);
      const tomorrow = departureAt(1);
      const predicted = await makeTrip(f, {
         departure_ts: tomorrow,
         is_predicted: true,
         pattern_id: pattern.id,
         prediction_confidence: 0.8,
         predicted_at: new Date(),
      });

      const low = new Date(tomorrow.getTime() - 2 * 60 * 60 * 1000);
      const high = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
      const baseWhere = {
         driver_id: f.driver.id,
         from_city_id: f.cityA.id,
         to_city_id: f.cityB.id,
         status: { [Op.in]: [TripStatus.Created, TripStatus.InProgress] },
         departure_ts: { [Op.between]: [low, high] },
      };

      // Как в импорте (с is_predicted:false) — прогноз НЕ считается дублем
      const withFilter = await Trip.findOne({
         where: { ...baseWhere, is_predicted: false },
      });
      expect(withFilter).toBeNull();

      // Без фильтра — тот же запрос нашёл бы прогноз (демонстрация важности фикса)
      const withoutFilter = await Trip.findOne({ where: baseWhere });
      expect(withoutFilter).not.toBeNull();
      expect(withoutFilter!.id).toBe(predicted.id);
   });

   it('runDaily expires past predictions', async () => {
      const pattern = await makePattern(f);
      const past = departureAt(-1);
      const stale = await makeTrip(f, {
         departure_ts: past,
         is_predicted: true,
         pattern_id: pattern.id,
         prediction_confidence: 0.8,
         predicted_at: new Date(),
      });
      await PredictionLog.create({
         pattern_id: pattern.id,
         predicted_trip: stale.id,
         target_date: uztDateString(past),
      } as any);

      await predictor.runDaily();

      expect(await Trip.findByPk(stale.id)).toBeNull(); // soft-deleted
      const log = await PredictionLog.findOne({
         where: { predicted_trip: stale.id },
      });
      expect(log!.outcome).toBe('expired');
      expect(log!.resolved_at).not.toBeNull();
   });
});
