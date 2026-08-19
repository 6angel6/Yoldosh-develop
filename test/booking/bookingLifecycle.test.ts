/**
 * Жизненный цикл бронирования: деньги и места.
 *
 * Проверяется ПОВЕДЕНИЕ, а не форма ответа: после каждого HTTP-вызова
 * Trip/Booking перечитываются из БД и сверяются числа (seats_available,
 * seatsBooked, totalPrice, статусы).
 *
 * Внешняя граница одна — Яндекс-геокодер (shared/utils/geoData):
 * createBooking резолвит адреса pickup/dropoff через getGeoData, без
 * сети/ключа реальный вызов невозможен. Мокается весь модуль.
 * Очереди уведомлений (BullMQ) работают против тестового Redis — не мокаются.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User, { UserRole } from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import Trip, {
   BookingType,
   GarageStatus,
   TripStatus,
} from '../../src/trips/models/Trip';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';
import { loginUser } from '../auth/test-helpers';

vi.mock('../../shared/utils/geoData', () => ({
   getGeoData: vi.fn(async (_longitude: number, _latitude: number) => ({
      address: 'Test Address',
      cityName: 'Toshkent',
   })),
}));

const DRIVER_PHONE = '+998990000101';
const PASSENGER_PHONE = '+998990000102';

const PRICE_PER_SEAT = 100000;
const TOTAL_SEATS = 4;

const hoursFromNow = (h: number): Date =>
   new Date(Date.now() + h * 60 * 60 * 1000);

describe('Booking: жизненный цикл (деньги/места/статусы)', () => {
   let driver: User;
   let passenger: User;
   let car: Car;
   let passengerToken: string;
   let driverToken: string;

   beforeEach(async () => {
      driver = await User.create({
         firstName: 'Lifecycle',
         lastName: 'Driver',
         phoneNumber: DRIVER_PHONE,
         role: UserRole.Driver,
         verified: true,
      } as any);
      passenger = await User.create({
         firstName: 'Lifecycle',
         lastName: 'Passenger',
         phoneNumber: PASSENGER_PHONE,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      car = await Car.create({
         driver_id: driver.id,
         make: 'Chevrolet',
         model: 'Cobalt',
         govNumber: '01B111BB',
         seats: 4,
         status: CarStatus.VERIFIED,
         techPassportFrontPath: 'test/placeholder',
         techPassportBackPath: 'test/placeholder',
      } as any);
      passengerToken = await loginUser(PASSENGER_PHONE);
      driverToken = await loginUser(DRIVER_PHONE);
   });

   // Трип создаётся напрямую через модель — обход геокодера в createTrip.
   const makeTrip = (overrides: any = {}): Promise<Trip> =>
      Trip.create({
         driver_id: driver.id,
         car_id: car.id,
         from_city: 'Toshkent',
         to_city: 'Samarqand',
         from_latitude: 41.31,
         from_longitude: 69.24,
         to_latitude: 39.65,
         to_longitude: 66.97,
         from_address: 'Tashkent center',
         to_address: 'Samarkand center',
         booking_type: BookingType.instant,
         departure_ts: hoursFromNow(24),
         duration: 240,
         seats_available: TOTAL_SEATS,
         price_per_person: PRICE_PER_SEAT,
         max_two_back: false,
         garage: GarageStatus.Empty,
         status: TripStatus.Created,
         is_predicted: false,
         ...overrides,
      } as any);

   const bookViaHttp = (token: string, body: Record<string, unknown>) =>
      request(app)
         .post('/api/v1/booking')
         .set('Authorization', `Bearer ${token}`)
         .send({
            pickup_latitude: 41.31,
            pickup_longitude: 69.24,
            dropoff_latitude: 39.65,
            dropoff_longitude: 66.97,
            ...body,
         });

   it('INSTANT: бронь создаётся CONFIRMED, места списываются, цена = seats × price', async () => {
      const trip = await makeTrip();

      const res = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });

      expect(res.status).toBe(201);
      const bookingId = res.body.data.booking.id;

      const booking = await Booking.findByPk(bookingId);
      expect(booking).not.toBeNull();
      expect(booking!.status).toBe(BookingStatus.CONFIRMED);
      expect(booking!.seatsBooked).toBe(2);
      expect(Number(booking!.totalPrice)).toBe(2 * PRICE_PER_SEAT);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS - 2);
   });

   it('нехватка мест → 400, места и брони не изменились', async () => {
      const trip = await makeTrip({ seats_available: 1 });

      const res = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Not enough available seats');

      await trip.reload();
      expect(trip.seats_available).toBe(1);
      expect(await Booking.count({ where: { tripId: trip.id } })).toBe(0);
   });

   it('повторная бронь тем же пассажиром → 400, вторая бронь не создаётся', async () => {
      const trip = await makeTrip();

      const first = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 1,
      });
      expect(first.status).toBe(201);

      const second = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 1,
      });
      expect(second.status).toBe(400);
      expect(second.body.message).toContain('already booked');

      await trip.reload();
      // списание только за первую бронь
      expect(trip.seats_available).toBe(TOTAL_SEATS - 1);
      expect(await Booking.count({ where: { tripId: trip.id } })).toBe(1);
   });

   it('REQUEST: бронь создаётся PENDING, места НЕ списываются до подтверждения', async () => {
      const trip = await makeTrip({ booking_type: BookingType.request });

      const res = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });

      expect(res.status).toBe(201);
      const booking = await Booking.findByPk(res.body.data.booking.id);
      expect(booking!.status).toBe(BookingStatus.PENDING);
      expect(Number(booking!.totalPrice)).toBe(2 * PRICE_PER_SEAT);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS); // ничего не списано
   });

   it('confirmBooking: водитель подтверждает REQUEST → CONFIRMED, места списываются', async () => {
      const trip = await makeTrip({ booking_type: BookingType.request });

      const created = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });
      expect(created.status).toBe(201);
      const bookingId = created.body.data.booking.id;

      const res = await request(app)
         .post(`/api/v1/booking/${bookingId}/confirm`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send();

      expect(res.status).toBe(200);

      const booking = await Booking.findByPk(bookingId);
      expect(booking!.status).toBe(BookingStatus.CONFIRMED);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS - 2);
   });

   it('cancelBooking: пассажир отменяет CONFIRMED бронь → CANCELLED, места возвращаются', async () => {
      const trip = await makeTrip();

      const created = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });
      expect(created.status).toBe(201);
      const bookingId = created.body.data.booking.id;

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS - 2); // места удержаны

      const res = await request(app)
         .patch(`/api/v1/booking/${bookingId}/cancel`)
         .set('Authorization', `Bearer ${passengerToken}`)
         .send({ cancellationReason: 'Passenger changed plans' });

      expect(res.status).toBe(200);

      const booking = await Booking.findByPk(bookingId);
      expect(booking!.status).toBe(BookingStatus.CANCELLED);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS); // все места вернулись
   });

   it('updateBooking: изменение seatsBooked пересчитывает totalPrice и места трипа', async () => {
      const trip = await makeTrip();

      const created = await bookViaHttp(passengerToken, {
         tripId: trip.id,
         seatsBooked: 2,
      });
      expect(created.status).toBe(201);
      const bookingId = created.body.data.booking.id;

      // 2 → 3 места: цена растёт, свободные места убывают
      const up = await request(app)
         .patch(`/api/v1/booking/${bookingId}`)
         .set('Authorization', `Bearer ${passengerToken}`)
         .send({ seatsBooked: 3 });
      expect(up.status).toBe(200);

      let booking = await Booking.findByPk(bookingId);
      expect(booking!.seatsBooked).toBe(3);
      expect(Number(booking!.totalPrice)).toBe(3 * PRICE_PER_SEAT);
      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS - 3);

      // 3 → 1 место: цена и места пересчитываются в обратную сторону
      const down = await request(app)
         .patch(`/api/v1/booking/${bookingId}`)
         .set('Authorization', `Bearer ${passengerToken}`)
         .send({ seatsBooked: 1 });
      expect(down.status).toBe(200);

      booking = await Booking.findByPk(bookingId);
      expect(booking!.seatsBooked).toBe(1);
      expect(Number(booking!.totalPrice)).toBe(1 * PRICE_PER_SEAT);
      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS - 1);
   });
});
