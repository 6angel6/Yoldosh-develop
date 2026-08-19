/**
 * Жизненный цикл трипа: статусная машина, каскад отмены броней, комиссия.
 *
 * Всё через HTTP (контрактные утверждения) + перечитывание Trip/Booking/Wallet
 * из БД после каждого вызова. Трипы и брони создаются напрямую через модели
 * (обход геокодера), IN_PROGRESS достигается честным startTrip по HTTP —
 * он же проверяет требования lifecycle (кошелёк, навигатор, брони).
 */
import { beforeEach, describe, expect, it } from 'vitest';
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
import Wallet from '../../src/payment/models/Wallet';
import Transaction, {
   TransactionType,
} from '../../src/payment/models/Transaction';
import { COMMISSION_CONFIG } from '../../shared/config/commission';
import { loginUser } from '../auth/test-helpers';

const DRIVER_PHONE = '+998990000201';
const PASSENGER_PHONE = '+998990000202';
const PASSENGER2_PHONE = '+998990000203';

const PRICE_PER_SEAT = 100000;
const TOTAL_SEATS = 4;
const DRIVER_BALANCE = 5000;

const hoursFromNow = (h: number): Date =>
   new Date(Date.now() + h * 60 * 60 * 1000);

describe('Trip: жизненный цикл (статусы/брони/комиссия)', () => {
   let driver: User;
   let passenger: User;
   let passenger2: User;
   let car: Car;
   let driverToken: string;

   beforeEach(async () => {
      driver = await User.create({
         firstName: 'Lifecycle',
         lastName: 'Driver',
         phoneNumber: DRIVER_PHONE,
         role: UserRole.Driver,
         verified: true,
      } as any);
      // startTrip требует кошелёк с балансом не ниже MIN_DRIVER_BALANCE,
      // completeTrip ищет кошелёк даже при нулевой комиссии.
      await Wallet.create({
         userId: driver.id,
         balance: DRIVER_BALANCE,
      } as any);
      passenger = await User.create({
         firstName: 'First',
         lastName: 'Passenger',
         phoneNumber: PASSENGER_PHONE,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      passenger2 = await User.create({
         firstName: 'Second',
         lastName: 'Passenger',
         phoneNumber: PASSENGER2_PHONE,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      car = await Car.create({
         driver_id: driver.id,
         make: 'Chevrolet',
         model: 'Cobalt',
         govNumber: '01C222CC',
         seats: 4,
         status: CarStatus.VERIFIED,
         techPassportFrontPath: 'test/placeholder',
         techPassportBackPath: 'test/placeholder',
      } as any);
      driverToken = await loginUser(DRIVER_PHONE);
   });

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

   const makeBooking = (
      trip: Trip,
      who: User,
      status: BookingStatus,
      seats: number,
   ): Promise<Booking> =>
      Booking.create({
         tripId: trip.id,
         passengerId: who.id,
         seatsBooked: seats,
         totalPrice: seats * PRICE_PER_SEAT,
         status,
         from_city: 'Toshkent',
         to_city: 'Samarqand',
      } as any);

   const startTripHttp = (tripId: string) =>
      request(app)
         .post(`/api/v1/trip/${tripId}/start`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send();

   const completeTripHttp = (tripId: string) =>
      request(app)
         .post(`/api/v1/trip/${tripId}/complete`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send();

   it('cancelTrip: CONFIRMED и PENDING брони становятся CANCELLED, места возвращены', async () => {
      // 2 места из 4 удержаны CONFIRMED-бронью; PENDING мест не держит
      const trip = await makeTrip({ seats_available: TOTAL_SEATS - 2 });
      const confirmed = await makeBooking(
         trip,
         passenger,
         BookingStatus.CONFIRMED,
         2,
      );
      const pending = await makeBooking(
         trip,
         passenger2,
         BookingStatus.PENDING,
         1,
      );

      const res = await request(app)
         .patch(`/api/v1/trip/${trip.id}/cancel`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send();

      expect(res.status).toBe(200);

      await trip.reload();
      await confirmed.reload();
      await pending.reload();

      expect(trip.status).toBe(TripStatus.Canceled);
      // возвращаются ровно места CONFIRMED-брони (PENDING ничего не держал)
      expect(trip.seats_available).toBe(TOTAL_SEATS);
      expect(confirmed.status).toBe(BookingStatus.CANCELLED);
      expect(pending.status).toBe(BookingStatus.CANCELLED);
   });

   it('completeTrip: при нулевой комиссии баланс водителя не меняется и COMMISSION-транзакция не создаётся', async () => {
      // Тест осмыслен только при нулевой комиссии — фиксируем предусловие
      expect(COMMISSION_CONFIG.TRIP_COMMISSION_PERCENTAGE).toBe(0);

      const trip = await makeTrip({ seats_available: TOTAL_SEATS - 2 });
      // ненулевая выручка: если бы комиссия считалась, она была бы > 0
      await makeBooking(trip, passenger, BookingStatus.CONFIRMED, 2);

      const started = await startTripHttp(trip.id);
      expect(started.status).toBe(200);

      const res = await completeTripHttp(trip.id);
      expect(res.status).toBe(200);

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Completed);

      const wallet = await Wallet.findOne({ where: { userId: driver.id } });
      expect(Number(wallet!.balance)).toBe(DRIVER_BALANCE);

      const commissions = await Transaction.findAll({
         where: { type: TransactionType.COMMISSION },
      });
      expect(commissions).toHaveLength(0);
   });

   it('completeTrip из CREATED (без startTrip) → 400, статус не изменился', async () => {
      const trip = await makeTrip();

      const res = await completeTripHttp(trip.id);

      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('TRIP_INVALID_TRANSITION');

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Created);
   });

   it('двойной completeTrip (параллельно) → ровно один успех, второй 400, статус COMPLETED', async () => {
      const trip = await makeTrip();

      const started = await startTripHttp(trip.id);
      expect(started.status).toBe(200);

      const [r1, r2] = await Promise.all([
         completeTripHttp(trip.id),
         completeTripHttp(trip.id),
      ]);

      const codes = [r1.status, r2.status];
      expect(codes.filter((c) => c === 200)).toHaveLength(1);
      expect(codes.filter((c) => c === 400)).toHaveLength(1);

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Completed);
   });
});
