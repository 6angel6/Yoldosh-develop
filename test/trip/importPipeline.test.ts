/**
 * Интеграция importTripFromExternal — единственная точка входа данных от
 * Python-парсера (POST /api/v1/internal/trips/import).
 *
 * Яндекс-геокодер замокан на границе HTTP-клиента (модуль
 * shared/api/yandexMap/yandexGeocoder): города резолвятся из таблицы cities
 * (canonical_ru/uz/en), а для неизвестных имён мок возвращает пустую выдачу —
 * ровно так ведёт себя прод, когда Яндекс не нашёл locality в UZ.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../shared/api/yandexMap/yandexGeocoder', () => {
   // Пустая коллекция: geокодер «ничего не нашёл» — города должны
   // резолвиться из БД cities, иначе импорт обязан ответить 400.
   const emptyCollection = () => ({
      response: {
         GeoObjectCollection: {
            metaDataProperty: {
               GeocoderResponseMetaData: {
                  request: '',
                  found: '0',
                  results: '0',
                  skip: '0',
               },
            },
            featureMember: [],
         },
      },
   });
   return {
      geocode: vi.fn(async () => emptyCollection()),
      getCoordsFromAddress: vi.fn(async () => emptyCollection()),
      getCityCoordsInUzbekistan: vi.fn(async () => emptyCollection()),
      getAddressFromCoords: vi.fn(async () => emptyCollection()),
   };
});

import { app } from '../../src/main';
import db from '../../shared/config/database';
import User, { UserRole } from '../../src/user/models/User';
import Car from '../../src/car/model/Car';
import Trip, { TripStatus } from '../../src/trips/models/Trip';
import City from '../../src/city/models/City';
import Wallet from '../../src/payment/models/Wallet';
import * as cityResolver from '../../src/city/service/cityResolver';

const IMPORT_URL = '/api/v1/internal/trips/import';
// Если ключ задан в env — guard требует его точного совпадения;
// если не задан — в NODE_ENV=test guard пропускает без проверки.
const internalKey = () => process.env.INTERNAL_API_KEY || 'not-configured';

const DRIVER_PHONE = '+998907001122';

const tomorrowAt = (hourUtc: number): string => {
   const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
   d.setUTCHours(hourUtc, 0, 0, 0);
   return d.toISOString();
};

const basePayload = (overrides: Record<string, unknown> = {}) => ({
   from_city: 'Toshkent',
   to_city: 'Samarqand',
   phone: DRIVER_PHONE,
   first_name: 'Imported',
   last_name: 'Driver',
   car_make: 'Chevrolet',
   car_model: 'Cobalt',
   car_number: '01A123AA',
   price: 120000,
   seats_available: 3,
   departure_ts: tomorrowAt(9),
   ...overrides,
});

const importTrip = (payload: unknown) =>
   request(app)
      .post(IMPORT_URL)
      .set('x-internal-key', internalKey())
      .send(payload as object);

const realTripsCount = () => Trip.count({ where: { is_predicted: false } });

describe('Импорт трипа от парсера (importTripFromExternal)', () => {
   let cityA: City;
   let cityB: City;

   beforeEach(async () => {
      // In-memory кэш городов (city-by-point/search-target) переживает
      // TRUNCATE между тестами — сбрасываем, чтобы не словить устаревшие id.
      cityResolver.clearCache();

      cityA = await City.create({
         canonical_ru: 'Ташкент',
         canonical_uz: 'Toshkent',
         canonical_en: 'Tashkent',
         admin_level: 4,
         kind: 'city',
         center_geo: { type: 'Point', coordinates: [69.24, 41.31] },
      } as any);
      cityB = await City.create({
         canonical_ru: 'Самарканд',
         canonical_uz: 'Samarqand',
         canonical_en: 'Samarkand',
         admin_level: 4,
         kind: 'city',
         center_geo: { type: 'Point', coordinates: [66.97, 39.65] },
      } as any);
   });

   it('валидный payload с новым водителем: создаются User, Car и Trip, ответ 201', async () => {
      const response = await importTrip(basePayload());

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Trip imported successfully.');
      expect(response.body.data.driver.isNew).toBe(true);
      expect(response.body.data.driver.phone).toBe(DRIVER_PHONE);
      expect(response.body.data.car.govNumber).toBe('01A123AA');
      expect(response.body.data.trip.id).toBeTruthy();

      const driver = await User.findOne({
         where: { phoneNumber: DRIVER_PHONE },
      });
      expect(driver).not.toBeNull();
      expect(driver!.role).toBe(UserRole.Driver);
      expect(driver!.verified).toBe(true);

      // Импорт заводит кошелёк новому внешнему водителю
      const wallet = await Wallet.findOne({ where: { userId: driver!.id } });
      expect(wallet).not.toBeNull();

      const car = await Car.findOne({ where: { driver_id: driver!.id } });
      expect(car).not.toBeNull();
      expect(car!.govNumber).toBe('01A123AA');

      const trip = await Trip.findOne({ where: { driver_id: driver!.id } });
      expect(trip).not.toBeNull();
      expect(trip!.car_id).toBe(car!.id);
      expect(trip!.from_city_id).toBe(cityA.id);
      expect(trip!.to_city_id).toBe(cityB.id);
      expect(trip!.status).toBe(TripStatus.Created);
      expect(Number(trip!.price_per_person)).toBe(120000);
      expect(trip!.seats_available).toBe(3);
   });

   it('повторный импорт того же объявления: дедуп уровня 1 (машина/маршрут/окно), второй трип не создаётся', async () => {
      const first = await importTrip(basePayload());
      expect(first.status).toBe(201);

      const second = await importTrip(basePayload());
      expect(second.status).toBe(200);
      expect(second.body.success).toBe(true);
      expect(second.body.message).toBe(
         'Trip skipped — duplicate active trip exists for this driver and route.',
      );
      // success(res, null, ...) не добавляет поле data вовсе
      expect(second.body).not.toHaveProperty('data');

      expect(await realTripsCount()).toBe(1);
      expect(await User.count({ where: { phoneNumber: DRIVER_PHONE } })).toBe(
         1,
      );
      const driver = await User.findOne({
         where: { phoneNumber: DRIVER_PHONE },
      });
      expect(await Car.count({ where: { driver_id: driver!.id } })).toBe(1);
   });

   it('дедуп уровня 2 (гео, 5 км): без госномера дубликат ловится по координатам', async () => {
      const payload = basePayload({ car_number: undefined });
      delete (payload as any).car_number;

      const first = await importTrip(payload);
      expect(first.status).toBe(201);

      // В проде from_geo/to_geo заполняет триггер fill_trip_geo_fields,
      // которого нет при db.sync — воспроизводим его руками, иначе
      // ST_DWithin(from_geo, ...) сравнивает с NULL и гео-дедуп слеп.
      await db.query(`
         UPDATE trips
            SET from_geo = ST_SetSRID(ST_MakePoint(from_longitude, from_latitude), 4326)::geography,
                to_geo   = ST_SetSRID(ST_MakePoint(to_longitude, to_latitude), 4326)::geography
          WHERE deleted_at IS NULL;
      `);

      const second = await importTrip(payload);
      expect(second.status).toBe(200);
      expect(second.body.message).toBe(
         'Trip skipped — duplicate active trip exists for this driver and route.',
      );

      expect(await realTripsCount()).toBe(1);
   });

   it('пустой payload {} — 400 с ошибками валидации, не 500', async () => {
      const response = await importTrip({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.status_code).toBe(400);
      expect(response.body.message).toBe('Validation failed.');
      // apiResponse.badRequest кладёт детали в body.errors
      expect(response.body.errors).toBeTruthy();

      expect(await realTripsCount()).toBe(0);
   });

   it('мусорный payload (неверные типы/формат телефона) — 400, не 500', async () => {
      const response = await importTrip({
         from_city: 123,
         to_city: null,
         phone: 'abc',
         first_name: '',
         seats_available: -5,
         price: 'free',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed.');

      expect(await realTripsCount()).toBe(0);
      expect(await User.count()).toBe(0);
   });

   it('неизвестный город (нет в БД, Яндекс не нашёл locality) — 400', async () => {
      const response = await importTrip(
         basePayload({ from_city: 'Атлантида' }),
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.status_code).toBe(400);
      expect(response.body.message).toContain('Unknown city');
      expect(response.body.message).toContain('Атлантида');

      expect(await realTripsCount()).toBe(0);
      // Пользователь тоже не должен появиться: резолв городов идёт до транзакции
      expect(await User.count({ where: { phoneNumber: DRIVER_PHONE } })).toBe(
         0,
      );
   });
});
