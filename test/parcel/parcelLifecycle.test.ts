/**
 * Посылки (MVP): жизненный цикл заявки и связь с трипом.
 *
 * Модель максимально простая (как Яндекс Доставка): только точка А → точка Б,
 * о самой посылке ничего не известно. Флоу как у брони — по booking_type
 * трипа: INSTANT → сразу CONFIRMED, REQUEST → PENDING.
 *
 * Проверяется ПОВЕДЕНИЕ: после каждого HTTP-вызова Parcel/Trip перечитываются
 * из БД и сверяются статусы/цена. Посылка не занимает места —
 * seats_available не должен меняться ни на одном шаге.
 *
 * Внешняя граница одна — Яндекс-геокодер (shared/utils/geoData):
 * createParcel резолвит адреса pickup/dropoff через getGeoData, без
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
import Parcel, { ParcelStatus } from '../../src/parcel/models/Parcel';
import { loginUser } from '../auth/test-helpers';

vi.mock('../../shared/utils/geoData', () => ({
   getGeoData: vi.fn(async (_longitude: number, _latitude: number) => ({
      address: 'Test Address',
      cityName: 'Toshkent',
   })),
}));

const DRIVER_PHONE = '+998990000201';
const SENDER_PHONE = '+998990000202';

const PRICE_PER_SEAT = 100000;
const PARCEL_PRICE = 40000;
const TOTAL_SEATS = 4;

const hoursFromNow = (h: number): Date =>
   new Date(Date.now() + h * 60 * 60 * 1000);

describe('Parcel: жизненный цикл (статусы/цена/места)', () => {
   let driver: User;
   let sender: User;
   let car: Car;
   let senderToken: string;
   let driverToken: string;

   beforeEach(async () => {
      driver = await User.create({
         firstName: 'Parcel',
         lastName: 'Driver',
         phoneNumber: DRIVER_PHONE,
         role: UserRole.Driver,
         verified: true,
      } as any);
      sender = await User.create({
         firstName: 'Parcel',
         lastName: 'Sender',
         phoneNumber: SENDER_PHONE,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      car = await Car.create({
         driver_id: driver.id,
         make: 'Chevrolet',
         model: 'Cobalt',
         govNumber: '01P111PP',
         seats: 4,
         status: CarStatus.VERIFIED,
         techPassportFrontPath: 'test/placeholder',
         techPassportBackPath: 'test/placeholder',
      } as any);
      senderToken = await loginUser(SENDER_PHONE);
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
         parcels_allowed: true,
         parcel_price: null,
         ...overrides,
      } as any);

   // Тело посылки — ТОЛЬКО точки А и Б, никаких данных о содержимом
   const sendParcelViaHttp = (token: string, body: Record<string, unknown>) =>
      request(app)
         .post('/api/v1/parcel')
         .set('Authorization', `Bearer ${token}`)
         .send({
            pickup_latitude: 41.31,
            pickup_longitude: 69.24,
            dropoff_latitude: 39.65,
            dropoff_longitude: 66.97,
            ...body,
         });

   const driverAction = (parcelId: string, action: string) =>
      request(app)
         .post(`/api/v1/parcel/${parcelId}/${action}`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send({});

   it('INSTANT-трип: посылка сразу CONFIRMED, цена = price_per_person, места не тронуты', async () => {
      const trip = await makeTrip();

      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });

      expect(res.status).toBe(201);
      const parcelId = res.body.data.parcel.id;

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel).not.toBeNull();
      expect(parcel!.status).toBe(ParcelStatus.CONFIRMED);
      expect(Number(parcel!.price)).toBe(PRICE_PER_SEAT);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS);
   });

   it('REQUEST-трип: посылка создаётся PENDING', async () => {
      const trip = await makeTrip({ booking_type: BookingType.request });

      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });

      expect(res.status).toBe(201);
      const parcel = await Parcel.findByPk(res.body.data.parcel.id);
      expect(parcel!.status).toBe(ParcelStatus.PENDING);
   });

   it('parcel_price трипа имеет приоритет над price_per_person', async () => {
      const trip = await makeTrip({ parcel_price: PARCEL_PRICE });

      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });

      expect(res.status).toBe(201);
      const parcel = await Parcel.findByPk(res.body.data.parcel.id);
      expect(Number(parcel!.price)).toBe(PARCEL_PRICE);
   });

   it('трип без parcels_allowed → 400, посылка не создаётся', async () => {
      const trip = await makeTrip({ parcels_allowed: false });

      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });

      expect(res.status).toBe(400);
      expect(await Parcel.count()).toBe(0);
   });

   it('водитель не может отправить посылку своим же трипом → 400', async () => {
      const trip = await makeTrip();

      const res = await sendParcelViaHttp(driverToken, { tripId: trip.id });

      expect(res.status).toBe(400);
   });

   it('вторая активная посылка на тот же трип → 400', async () => {
      const trip = await makeTrip();

      const first = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      expect(first.status).toBe(201);

      const second = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      expect(second.status).toBe(400);
      expect(await Parcel.count()).toBe(1);
   });

   it('полный happy-path REQUEST: confirm → pickup → deliver', async () => {
      const trip = await makeTrip({ booking_type: BookingType.request });
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const confirmRes = await driverAction(parcelId, 'confirm');
      expect(confirmRes.status).toBe(200);
      let parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.CONFIRMED);

      const pickupRes = await driverAction(parcelId, 'pickup');
      expect(pickupRes.status).toBe(200);
      parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.PICKED_UP);

      const deliverRes = await driverAction(parcelId, 'deliver');
      expect(deliverRes.status).toBe(200);
      parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.DELIVERED);

      await trip.reload();
      expect(trip.seats_available).toBe(TOTAL_SEATS);
   });

   it('невалидный переход: deliver из CONFIRMED (без pickup) → 400', async () => {
      const trip = await makeTrip();
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const deliverRes = await driverAction(parcelId, 'deliver');
      expect(deliverRes.status).toBe(400);

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.CONFIRMED);
   });

   it('reject: PENDING → REJECTED (REQUEST-трип)', async () => {
      const trip = await makeTrip({ booking_type: BookingType.request });
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const rejectRes = await driverAction(parcelId, 'reject');
      expect(rejectRes.status).toBe(200);

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.REJECTED);
   });

   it('чужой водитель не может подтвердить посылку', async () => {
      const otherDriverPhone = '+998990000203';
      await User.create({
         firstName: 'Other',
         lastName: 'Driver',
         phoneNumber: otherDriverPhone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      const otherToken = await loginUser(otherDriverPhone);

      const trip = await makeTrip({ booking_type: BookingType.request });
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const confirmRes = await request(app)
         .post(`/api/v1/parcel/${parcelId}/confirm`)
         .set('Authorization', `Bearer ${otherToken}`)
         .send({});
      expect(confirmRes.status).toBe(403);

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.PENDING);
   });

   it('отправитель отменяет свою посылку (до забора)', async () => {
      const trip = await makeTrip();
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const cancelRes = await request(app)
         .patch(`/api/v1/parcel/${parcelId}/cancel`)
         .set('Authorization', `Bearer ${senderToken}`)
         .send({ cancellationReason: 'Передумал' });
      expect(cancelRes.status).toBe(200);

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.CANCELLED);
   });

   it('DELIVERED посылку отправитель отменить не может → 404', async () => {
      const trip = await makeTrip();
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      await driverAction(parcelId, 'pickup');
      await driverAction(parcelId, 'deliver');

      const cancelRes = await request(app)
         .patch(`/api/v1/parcel/${parcelId}/cancel`)
         .set('Authorization', `Bearer ${senderToken}`)
         .send({ cancellationReason: 'Поздно' });
      expect(cancelRes.status).toBe(404);
   });

   it('отмена трипа гасит активные посылки', async () => {
      const trip = await makeTrip();
      const res = await sendParcelViaHttp(senderToken, { tripId: trip.id });
      const parcelId = res.body.data.parcel.id;

      const cancelTripRes = await request(app)
         .patch(`/api/v1/trip/${trip.id}/cancel`)
         .set('Authorization', `Bearer ${driverToken}`)
         .send({});
      expect(cancelTripRes.status).toBe(200);

      const parcel = await Parcel.findByPk(parcelId);
      expect(parcel!.status).toBe(ParcelStatus.CANCELLED);
   });

   it('водитель видит посылки трипа: GET /parcel/trip/:tripId', async () => {
      const trip = await makeTrip();
      await sendParcelViaHttp(senderToken, { tripId: trip.id });

      const listRes = await request(app)
         .get(`/api/v1/parcel/trip/${trip.id}`)
         .set('Authorization', `Bearer ${driverToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].status).toBe(ParcelStatus.CONFIRMED);
      expect(listRes.body.data[0].pickup_location.coordinates.latitude).toBe(
         41.31,
      );
   });
});
