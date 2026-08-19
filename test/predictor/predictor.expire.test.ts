/**
 * Trip Predictor — снятие неподтверждённых прогнозов.
 *
 * Ключевая гарантия: прогноз, на котором висит бронь, нельзя удалить молча —
 * бронь должна быть отменена с причиной (пассажира уведомляет notifyPassengers
 * после commit). Прогноз без броней никому ничего не обещал и доживает до
 * времени выезда.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../shared/config/database';
import { PREDICTION_CONFIG } from '../../shared/config/prediction';
import { predictor } from '../../src/trips/predictor';
import DriverPattern from '../../src/trips/predictor/models/DriverPattern';
import PredictionLog from '../../src/trips/predictor/models/PredictionLog';
import { uztDateString } from '../../src/trips/predictor/timeUZT';
import Trip, {
   BookingType,
   GarageStatus,
   TripStatus,
} from '../../src/trips/models/Trip';
import User, { UserRole, RegistrationSource } from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import City from '../../src/city/models/City';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';

const hoursFromNow = (h: number): Date =>
   new Date(Date.now() + h * 60 * 60 * 1000);

interface Fixtures {
   cityA: City;
   cityB: City;
   driver: User;
   passenger: User;
   car: Car;
   pattern: DriverPattern;
}

const seed = async (): Promise<Fixtures> => {
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
   const passenger = await User.create({
      firstName: 'Passenger',
      phoneNumber: '+998907778899',
      role: UserRole.Passenger,
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
   const today = uztDateString(new Date());
   const pattern = await DriverPattern.create({
      driver_id: driver.id,
      from_city_id: cityA.id,
      to_city_id: cityB.id,
      departure_time: 480,
      time_tolerance: PREDICTION_CONFIG.TIME_TOLERANCE_MIN,
      recent_departure_min: [480],
      price: 100000,
      seats: 4,
      car_id: car.id,
      occurrences: 3,
      window_occurrences: 3,
      first_seen: today,
      last_seen: today,
      confidence: 0.8,
      status: 'active',
   } as any);
   return { cityA, cityB, driver, passenger, car, pattern };
};

const makePrediction = async (
   f: Fixtures,
   departureTs: Date,
): Promise<Trip> => {
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
      departure_ts: departureTs,
      duration: 240,
      seats_available: 4,
      price_per_person: 100000,
      max_two_back: false,
      garage: GarageStatus.Empty,
      status: TripStatus.Created,
      is_predicted: true,
      pattern_id: f.pattern.id,
      prediction_confidence: 0.8,
   } as any);
   await PredictionLog.create({
      pattern_id: f.pattern.id,
      predicted_trip: trip.id,
      target_date: uztDateString(departureTs),
   } as any);
   return trip;
};

const book = async (f: Fixtures, trip: Trip, status: BookingStatus) =>
   Booking.create({
      tripId: trip.id,
      passengerId: f.passenger.id,
      seatsBooked: 2,
      totalPrice: 200000,
      status,
      from_city: 'Toshkent',
      to_city: 'Samarqand',
   } as any);

describe('Trip Predictor — снятие неподтверждённых прогнозов', () => {
   let f: Fixtures;
   beforeEach(async () => {
      f = await seed();
   });

   it('неподтверждённый прогноз с бронью снимается ПОСЛЕ выезда, бронь отменяется с причиной', async () => {
      const trip = await makePrediction(f, hoursFromNow(-1));
      const booking = await book(f, trip, BookingStatus.PENDING);

      await predictor.runExpireSweep();

      const afterTrip = await Trip.findByPk(trip.id, { paranoid: false });
      expect(afterTrip!.deletedAt).not.toBeNull(); // soft-deleted

      await booking.reload();
      expect(booking.status).toBe(BookingStatus.CANCELLED);
      expect(booking.cancellationReason).toBe(
         'Driver did not confirm this trip.',
      );

      const log = await PredictionLog.findOne({
         where: { predicted_trip: trip.id },
      });
      expect(log!.outcome).toBe('expired');
   });

   it('подтверждённая бронь на прогнозе тоже отменяется', async () => {
      const trip = await makePrediction(f, hoursFromNow(-1));
      const booking = await book(f, trip, BookingStatus.CONFIRMED);

      await predictor.runExpireSweep();

      await booking.reload();
      expect(booking.status).toBe(BookingStatus.CANCELLED);
   });

   it('бронь в день выезда живёт до последнего: до departure_ts прогноз не трогаем', async () => {
      // «Сегодня забронировал — сегодня еду»: выезд через 3 часа, водитель ещё
      // может опубликовать объявление и подтвердить рейс. Ранняя отмена убила бы
      // бронь, которая вот-вот стала бы реальной.
      const trip = await makePrediction(f, hoursFromNow(3));
      const booking = await book(f, trip, BookingStatus.PENDING);

      await predictor.runExpireSweep();

      expect(await Trip.findByPk(trip.id)).not.toBeNull();
      await booking.reload();
      expect(booking.status).toBe(BookingStatus.PENDING);
   });

   it('бронь за минуту до выезда тоже не отменяется досрочно', async () => {
      const trip = await makePrediction(f, hoursFromNow(1 / 60));
      const booking = await book(f, trip, BookingStatus.PENDING);

      await predictor.runExpireSweep();

      expect(await Trip.findByPk(trip.id)).not.toBeNull();
      await booking.reload();
      expect(booking.status).toBe(BookingStatus.PENDING);
   });

   it('прогноз БЕЗ брони доживает до времени выезда и не снимается заранее', async () => {
      const trip = await makePrediction(f, hoursFromNow(3));

      await predictor.runExpireSweep();

      const after = await Trip.findByPk(trip.id);
      expect(after).not.toBeNull(); // всё ещё в выдаче
      expect(after!.status).toBe(TripStatus.Created);
   });

   it('прогноз без брони с прошедшим временем выезда снимается', async () => {
      const trip = await makePrediction(f, hoursFromNow(-1));

      await predictor.runExpireSweep();

      const after = await Trip.findByPk(trip.id);
      expect(after).toBeNull();
      const raw = await Trip.findByPk(trip.id, { paranoid: false });
      expect(raw!.deletedAt).not.toBeNull();
   });

   it('deactivatePattern гасит будущие прогнозы и отменяет брони на них', async () => {
      const soon = await makePrediction(f, hoursFromNow(30));
      const later = await makePrediction(f, hoursFromNow(54));
      const booking = await book(f, soon, BookingStatus.CONFIRMED);

      await predictor.deactivatePattern(f.pattern.id);

      await f.pattern.reload();
      expect(f.pattern.status).toBe('inactive');

      expect(await Trip.findByPk(soon.id)).toBeNull();
      expect(await Trip.findByPk(later.id)).toBeNull();

      await booking.reload();
      expect(booking.status).toBe(BookingStatus.CANCELLED);
      expect(booking.cancellationReason).toBe('Trip cancelled by driver.');

      const logs = await PredictionLog.findAll({
         where: { pattern_id: f.pattern.id },
      });
      expect(logs.every((l) => l.outcome === 'cancelled')).toBe(true);
   });

   it('снятый прогноз освобождает день: новый прогноз на тот же день создаётся', async () => {
      // Уникальный индекс частичный по deleted_at IS NULL — soft-delete должен
      // освободить (водитель, маршрут, день), иначе долив горизонта заклинит.
      await db.query(`
         CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_predicted_day
            ON trips (driver_id, from_city_id, to_city_id,
                      ((timezone('Asia/Tashkent', departure_ts))::date))
            WHERE is_predicted = TRUE AND deleted_at IS NULL;
      `);
      const trip = await makePrediction(f, hoursFromNow(-1));
      await predictor.runExpireSweep();

      const again = await makePrediction(f, hoursFromNow(-1));
      expect(again.id).not.toBe(trip.id);
   });
});
