/**
 * Воркер просроченных трипов: CREATED → CANCELED, IN_PROGRESS → COMPLETED.
 *
 * Ключевое, что здесь проверяется: воркер не трогает свежие рейсы, не трогает
 * прогнозные трипы (их снимает предиктор через soft-delete) и не оставляет
 * висящих броней — ни подтверждённых, ни ожидающих.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { expireStaleTrips } from '../../src/workers/processors/recurring/staleTripProcessor';
import Trip, {
   BookingType,
   GarageStatus,
   TripStatus,
} from '../../src/trips/models/Trip';
import User, { UserRole, RegistrationSource } from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import City from '../../src/city/models/City';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';
import Wallet from '../../src/payment/models/Wallet';

const hoursFromNow = (h: number): Date =>
   new Date(Date.now() + h * 60 * 60 * 1000);

interface Fixtures {
   cityA: City;
   cityB: City;
   driver: User;
   passenger: User;
   car: Car;
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
      firstName: 'Driver',
      phoneNumber: '+998901112233',
      role: UserRole.Driver,
      verified: true,
      registration_source: RegistrationSource.FromBot,
   } as any);
   // completeTrip требует кошелёк водителя (комиссия сейчас 0%, но кошелёк ищется).
   await Wallet.create({ userId: driver.id, balance: 0 } as any);
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
   return { cityA, cityB, driver, passenger, car };
};

const makeTrip = async (f: Fixtures, overrides: any = {}): Promise<Trip> =>
   Trip.create({
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
      departure_ts: hoursFromNow(-48),
      duration: 240,
      seats_available: 4,
      price_per_person: 100000,
      max_two_back: false,
      garage: GarageStatus.Empty,
      status: TripStatus.Created,
      is_predicted: false,
      ...overrides,
   } as any);

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

describe('Просроченные трипы — воркер', () => {
   let f: Fixtures;
   beforeEach(async () => {
      f = await seed();
   });

   it('CREATED старше 24ч → CANCELED', async () => {
      const trip = await makeTrip(f, { departure_ts: hoursFromNow(-48) });

      await expireStaleTrips();

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Canceled);
   });

   it('IN_PROGRESS старше 24ч → COMPLETED', async () => {
      const trip = await makeTrip(f, {
         departure_ts: hoursFromNow(-48),
         status: TripStatus.InProgress,
      });

      await expireStaleTrips();

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Completed);
   });

   it('трип внутри 24ч не трогаем — водитель мог выехать с опозданием', async () => {
      const trip = await makeTrip(f, { departure_ts: hoursFromNow(-3) });

      await expireStaleTrips();

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Created);
   });

   it('будущий трип не трогаем', async () => {
      const trip = await makeTrip(f, { departure_ts: hoursFromNow(5) });

      await expireStaleTrips();

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Created);
   });

   it('прогнозный трип воркер не трогает — им занимается предиктор', async () => {
      const trip = await makeTrip(f, {
         departure_ts: hoursFromNow(-48),
         is_predicted: true,
      });

      await expireStaleTrips();

      await trip.reload();
      expect(trip.status).toBe(TripStatus.Created); // не CANCELED
   });

   it('подтверждённая бронь отменяется, места возвращаются', async () => {
      const trip = await makeTrip(f, {
         departure_ts: hoursFromNow(-48),
         seats_available: 2, // 2 из 4 заняты бронью
      });
      const booking = await book(f, trip, BookingStatus.CONFIRMED);

      await expireStaleTrips();

      await trip.reload();
      await booking.reload();
      expect(trip.status).toBe(TripStatus.Canceled);
      expect(booking.status).toBe(BookingStatus.CANCELLED);
      expect(trip.seats_available).toBe(4);
   });

   it('ожидающая бронь тоже отменяется, а не висит на отменённом рейсе', async () => {
      const trip = await makeTrip(f, { departure_ts: hoursFromNow(-48) });
      const booking = await book(f, trip, BookingStatus.PENDING);

      await expireStaleTrips();

      await booking.reload();
      expect(booking.status).toBe(BookingStatus.CANCELLED);
   });
});
