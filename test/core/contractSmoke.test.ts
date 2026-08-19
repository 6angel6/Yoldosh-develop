/**
 * Контракт-смоук форм ответов ключевых GET (инвариант №1: поля не
 * переименовываются, тип не меняется). Zod-схемы через z.looseObject
 * проверяют НАЛИЧИЕ и ТИП обязательных полей — не значения: аддитивные
 * поля не ломают тест, а переименование/смена типа — ломают.
 *
 * ВАЖНО: схемы фиксируют ТЕКУЩЕЕ поведение API как есть. В частности,
 * price_per_person на верхнем уровне трипа — строка "100000.00" (DECIMAL
 * из БД), а внутри объекта price — число. Так отвечает прод, фронт к
 * этому привязан — не «чинить».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { z } from 'zod';

vi.mock('../../shared/api/yandexMap/yandexGeocoder', () => {
   // Обратный геокодер (координаты → адрес) нужен searchTrips для
   // истории поиска; мокаем на границе HTTP-клиента.
   const localityResponse = (name: string, lon: number, lat: number) => ({
      response: {
         GeoObjectCollection: {
            metaDataProperty: {
               GeocoderResponseMetaData: {
                  request: name,
                  found: '1',
                  results: '1',
                  skip: '0',
               },
            },
            featureMember: [
               {
                  GeoObject: {
                     metaDataProperty: {
                        GeocoderMetaData: {
                           precision: 'other',
                           text: name,
                           kind: 'locality',
                           Address: {
                              country_code: 'UZ',
                              formatted: name,
                              Components: [{ kind: 'locality', name }],
                           },
                        },
                     },
                     name,
                     boundedBy: {
                        Envelope: { lowerCorner: '0 0', upperCorner: '0 0' },
                     },
                     Point: { pos: `${lon} ${lat}` },
                  },
               },
            ],
         },
      },
   });
   return {
      geocode: vi.fn(async () => localityResponse('Ташкент', 69.24, 41.31)),
      getCoordsFromAddress: vi.fn(async () =>
         localityResponse('Ташкент', 69.24, 41.31),
      ),
      getCityCoordsInUzbekistan: vi.fn(async () =>
         localityResponse('Ташкент', 69.24, 41.31),
      ),
      getAddressFromCoords: vi.fn(async (lon: number, lat: number) =>
         localityResponse(lat > 40.5 ? 'Ташкент' : 'Самарканд', lon, lat),
      ),
   };
});

import { app } from '../../src/main';
import db from '../../shared/config/database';
import User, { UserRole } from '../../src/user/models/User';
import Car, { CarStatus } from '../../src/car/model/Car';
import City from '../../src/city/models/City';
import Trip, {
   BookingType,
   GarageStatus,
   TripStatus,
} from '../../src/trips/models/Trip';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';
import * as cityResolver from '../../src/city/service/cityResolver';
import { loginUser } from '../auth/test-helpers';

// ---------------------------------------------------------------------------
// Общие схемы
// ---------------------------------------------------------------------------

const envelope = <T extends z.ZodTypeAny>(data: T) =>
   z.looseObject({
      success: z.literal(true),
      status_code: z.literal(200),
      message: z.string(),
      data,
   });

const coordinatesSchema = z.looseObject({
   longitude: z.number(),
   latitude: z.number(),
});

const locationSchema = z.looseObject({
   address: z.string(),
   city: z.string(),
   coordinates: coordinatesSchema,
});

const priceBlockSchema = z.looseObject({
   total_bookings_price: z.number(),
   price_per_person: z.number(),
   final_price: z.number(),
   currency: z.literal('UZS'),
   promocode: z.looseObject({
      discounted: z.number(),
      discount_percentage: z.number(),
      has_active_promocode: z.boolean(),
   }),
});

const tripStatusSchema = z.enum([
   'CREATED',
   'IN_PROGRESS',
   'COMPLETED',
   'CANCELED',
]);
const bookingTypeSchema = z.enum(['INSTANT', 'REQUEST']);

// Элемент выдачи /trip/search и /trip/my-activity (formatTripResponse):
// «сырые» поля модели + нормализованные from/to_location и price.
const tripListItemSchema = z.looseObject({
   id: z.uuid(),
   from_city_id: z.uuid(),
   to_city_id: z.uuid(),
   booking_type: bookingTypeSchema,
   departure_ts: z.string(),
   arrival_ts: z.string().nullable(),
   seats_available: z.number().int(),
   // DECIMAL из БД сериализуется строкой — текущий контракт
   price_per_person: z.string(),
   max_two_back: z.boolean(),
   conditioner: z.boolean(),
   smoking_allowed: z.boolean(),
   door_pickup: z.boolean(),
   food_stop: z.boolean(),
   garage: z.enum(['FULL', 'EMPTY', 'HALF_EMPTY']),
   status: tripStatusSchema,
   is_predicted: z.boolean(),
   prediction_confidence: z.number().nullable(),
   duration: z.number(),
   distance: z.number(),
   bookings: z.array(z.looseObject({ id: z.uuid() })),
   driver: z.looseObject({
      id: z.uuid(),
      firstName: z.string(),
      avatar: z.string().nullable(),
      rating: z.number(),
      passport_verified: z.boolean(),
   }),
   car: z.looseObject({
      id: z.uuid(),
      make: z.string().nullable(),
      model: z.string().nullable(),
   }),
   from_location: locationSchema,
   to_location: locationSchema,
   price: priceBlockSchema,
   total_seats_booked: z.number(),
});

const paginatedTripsSchema = z.looseObject({
   trips: z.array(tripListItemSchema).min(1),
   total: z.number().int(),
   totalPages: z.number().int(),
   currentPage: z.number().int(),
});

// ---------------------------------------------------------------------------
// Фикстуры
// ---------------------------------------------------------------------------

const box = (
   lonMin: number,
   latMin: number,
   lonMax: number,
   latMax: number,
) => ({
   type: 'MultiPolygon',
   coordinates: [
      [
         [
            [lonMin, latMin],
            [lonMax, latMin],
            [lonMax, latMax],
            [lonMin, latMax],
            [lonMin, latMin],
         ],
      ],
   ],
});

const tomorrowDate = (): string =>
   new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const PASSENGER_PHONE = '+998922222222';

describe('Контракт-смоук ключевых GET', () => {
   let tripId: string;
   let passengerToken: string;

   beforeEach(async () => {
      // In-memory кэш cityResolver переживает TRUNCATE — без сброса поиск
      // получил бы город с устаревшим id из предыдущего теста.
      cityResolver.clearCache();

      // users.is_wallet_blocked добавляется миграцией (не моделью), а SQL
      // поиска на неё ссылается. При db.sync колонки нет — добавляем так же,
      // как это делает миграция 20260415120002 (идемпотентно).
      await db.query(
         `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_wallet_blocked boolean NOT NULL DEFAULT false;`,
      );

      const cityA = await City.create({
         canonical_ru: 'Ташкент',
         canonical_uz: 'Toshkent',
         canonical_en: 'Tashkent',
         admin_level: 4,
         kind: 'city',
         center_geo: { type: 'Point', coordinates: [69.24, 41.31] },
         bbox_geo: box(68.9, 41.0, 69.6, 41.6),
      } as any);
      const cityB = await City.create({
         canonical_ru: 'Самарканд',
         canonical_uz: 'Samarqand',
         canonical_en: 'Samarkand',
         admin_level: 4,
         kind: 'city',
         center_geo: { type: 'Point', coordinates: [66.97, 39.65] },
         bbox_geo: box(66.6, 39.3, 67.3, 40.0),
      } as any);

      const driver = await User.create({
         firstName: 'Contract',
         lastName: 'Driver',
         phoneNumber: '+998911111111',
         role: UserRole.Driver,
         verified: true,
      } as any);
      const car = await Car.create({
         driver_id: driver.id,
         make: 'Chevrolet',
         model: 'Cobalt',
         govNumber: '01A777AA',
         seats: 4,
         status: CarStatus.VERIFIED,
         techPassportFrontPath: 'imported/placeholder',
         techPassportBackPath: 'imported/placeholder',
      } as any);

      const dep = new Date(`${tomorrowDate()}T09:00:00Z`);
      const trip = await Trip.create({
         driver_id: driver.id,
         car_id: car.id,
         from_city: cityA.canonical_uz,
         to_city: cityB.canonical_uz,
         from_city_id: cityA.id,
         to_city_id: cityB.id,
         from_latitude: 41.31,
         from_longitude: 69.24,
         to_latitude: 39.65,
         to_longitude: 66.97,
         from_address: 'Tashkent center',
         to_address: 'Samarkand center',
         booking_type: BookingType.request,
         departure_ts: dep,
         arrival_ts: new Date(dep.getTime() + 4 * 3600 * 1000),
         duration: 240,
         seats_available: 4,
         price_per_person: 100000,
         max_two_back: false,
         garage: GarageStatus.Empty,
         status: TripStatus.Created,
         is_predicted: false,
      } as any);
      tripId = trip.id;

      const passenger = await User.create({
         firstName: 'Contract',
         lastName: 'Passenger',
         phoneNumber: PASSENGER_PHONE,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      await Booking.create({
         tripId: trip.id,
         passengerId: passenger.id,
         seatsBooked: 1,
         totalPrice: 100000,
         status: BookingStatus.CONFIRMED,
         from_city: cityA.canonical_uz,
         to_city: cityB.canonical_uz,
      } as any);

      passengerToken = await loginUser(PASSENGER_PHONE);
   });

   it('GET /trip/search — форма ответа стабильна', async () => {
      const response = await request(app)
         .get('/api/v1/trip/search')
         .query({
            from_latitude: 41.31,
            from_longitude: 69.24,
            to_latitude: 39.65,
            to_longitude: 66.97,
            departure_date: tomorrowDate(),
            requested_seats: 1,
         })
         .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(200);

      // Для авторизованного пассажира каждый трип дополнен is_own_trip/is_booked
      const searchItemSchema = tripListItemSchema.extend({
         driver_id: z.uuid(),
         is_own_trip: z.boolean(),
         is_booked: z.boolean(),
      });
      const schema = envelope(
         paginatedTripsSchema.extend({
            trips: z.array(searchItemSchema).min(1),
         }),
      );
      const parsed = schema.parse(response.body);

      // Санити: поиск нашёл именно наш засеянный трип
      expect(parsed.data.trips[0].id).toBe(tripId);
      expect(parsed.data.total).toBe(1);
   });

   it('GET /trip/:tripId — форма деталей трипа стабильна', async () => {
      const response = await request(app)
         .get(`/api/v1/trip/${tripId}`)
         .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(200);

      // Детали — formatBaseTrip/-ForPassenger + контекстные флаги пользователя
      const tripDetailsSchema = z.looseObject({
         id: z.uuid(),
         departure_ts: z.string(),
         arrival_ts: z.string().nullable(),
         seats_available: z.number().int(),
         price_per_person: z.string(),
         max_two_back: z.boolean(),
         comment: z.string().nullable(),
         booking_type: bookingTypeSchema,
         status: tripStatusSchema,
         is_predicted: z.boolean(),
         prediction_confidence: z.number().nullable(),
         conditioner: z.boolean(),
         smoking_allowed: z.boolean(),
         door_pickup: z.boolean(),
         food_stop: z.boolean(),
         garage: z.enum(['FULL', 'EMPTY', 'HALF_EMPTY']),
         driver: z.looseObject({
            id: z.uuid(),
            firstName: z.string(),
            avatar: z.string().nullable(),
            rating: z.number(),
            rating_count: z.number(),
            passport_verified: z.boolean(),
         }),
         car: z.looseObject({
            id: z.uuid(),
            make: z.string().nullable(),
            model: z.string().nullable(),
            gov_number: z.string().nullable(),
            color: z.string().nullable(),
         }),
         duration: z.number(),
         distance: z.number(),
         booking_id: z.uuid().nullable(),
         bookings: z.array(
            z.looseObject({
               id: z.uuid(),
               seatsBooked: z.number(),
               status: z.string(),
            }),
         ),
         from_location: locationSchema,
         to_location: locationSchema,
         isCurrentUserDriver: z.boolean(),
         isBookedByUser: z.boolean(),
         is_booked: z.boolean(),
      });

      const parsed = envelope(z.looseObject({ trip: tripDetailsSchema })).parse(
         response.body,
      );

      expect(parsed.data.trip.id).toBe(tripId);
      expect(parsed.data.trip.status).toBe('CREATED');
   });

   it('GET /trip/my-activity?role=passenger («мои брони») — форма ответа стабильна', async () => {
      const response = await request(app)
         .get('/api/v1/trip/my-activity')
         .query({ role: 'passenger' })
         .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(200);

      const parsed = envelope(paginatedTripsSchema).parse(response.body);

      expect(parsed.data.trips[0].id).toBe(tripId);
      // Бронь пассажира присутствует в выдаче его активности
      expect(parsed.data.trips[0].bookings.length).toBeGreaterThan(0);
      expect(parsed.data.total).toBe(1);
   });

   it('GET /user/me/profile — форма профиля стабильна', async () => {
      const response = await request(app)
         .get('/api/v1/user/me/profile')
         .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(200);

      const profileSchema = envelope(
         z.looseObject({
            user: z.looseObject({
               id: z.uuid(),
               firstName: z.string(),
               lastName: z.string().nullable(),
               avatar: z.string().nullable(),
               phoneNumber: z.string(),
               role: z.enum(['Passenger', 'Driver']),
               rating: z.number(),
               rating_count: z.number(),
               hasFirstTrip: z.boolean(),
            }),
         }),
      );
      const parsed = profileSchema.parse(response.body);

      expect(parsed.data.user.phoneNumber).toBe(PASSENGER_PHONE);
      expect(parsed.data.user.role).toBe('Passenger');
   });
});
