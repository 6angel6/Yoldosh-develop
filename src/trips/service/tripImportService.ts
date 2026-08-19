import { z } from 'zod';
import { UserRole, RegistrationSource } from '../../user/models/User';
import { Car, CarStatus } from '../../car/model/Car';
import { BookingType, GarageStatus } from '../models/Trip';
import * as tripRepository from '../repository/tripRepository';
import * as userRepository from '../../user/repository/userRepository';
import * as carRepository from '../../car/repository/carRepository';
import { predictor } from '../predictor';
import * as walletRepository from '../../payment/repository/walletRepository';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { clearCache } from '../../../shared/config/redis';
import { formatTripResponse } from './tripFormatterService';
import { BadRequestError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import logger from '../../../shared/utils/logger';
import {
   normalizeCityName,
   getRussianCanonicalCityName,
} from '../../../shared/i18n/regionLocalization';
import * as yandexApiGeocoder from '../../../shared/api/yandexMap/yandexGeocoder';
import * as cityResolver from '../../city/service/cityResolver';
import * as cityRepository from '../../city/repository/cityRepository';

interface GeoResult {
   lat: number;
   lon: number;
   cityName: string;
}

/**
 * Геокодирует название города в Узбекистане через Яндекс.Геокодер.
 *
 * Принимаем ТОЛЬКО kind=locality (настоящий город). area (район) и province
 * (область) исключены: для мелких городов Яндекс часто отдаёт province
 * первым, и мы получили бы центр ОБЛАСТИ вместо города — bbox-match в БД
 * уводил в случайный соседний населённый пункт.
 *
 * Стратегия запросов — русская каноника → исходный ввод → "город <RU>":
 * для "Xiva"/"Asaka" на латинице топ Яндекса забит улицами в Ташкенте,
 * и без русской формы locality вообще не находится.
 */
const getCityGeoData = async (cityName: string): Promise<GeoResult | null> => {
   const normalized = cityName.trim();
   if (!normalized) return null;

   const russianCanonical = getRussianCanonicalCityName(normalized);
   const candidates: string[] = [];
   const pushUnique = (q: string) => {
      if (q && !candidates.includes(q)) candidates.push(q);
   };
   if (russianCanonical) pushUnique(russianCanonical);
   pushUnique(normalized);
   pushUnique(`город ${russianCanonical || normalized}`);

   const debugAttempts: Array<{
      query: string;
      results: Array<{ kind: string; country?: string; name: string }>;
   }> = [];

   for (const query of candidates) {
      try {
         const response =
            await yandexApiGeocoder.getCityCoordsInUzbekistan(query);
         const featureMembers =
            response?.response?.GeoObjectCollection?.featureMember || [];

         const debugKinds: Array<{
            kind: string;
            country?: string;
            name: string;
         }> = [];

         for (const member of featureMembers) {
            const geoObject = member.GeoObject;
            const metaData = geoObject.metaDataProperty?.GeocoderMetaData;
            const actualKind = metaData?.kind || '';
            const countryCode = metaData?.Address?.country_code;

            debugKinds.push({
               kind: actualKind,
               country: countryCode,
               name: geoObject.name,
            });

            if (actualKind !== 'locality') continue;
            if (countryCode !== 'UZ') continue;
            if (!geoObject.Point?.pos) continue;

            const [lon, lat] = geoObject.Point.pos.split(' ').map(parseFloat);
            if (isNaN(lon) || isNaN(lat)) continue;

            const components = metaData.Address?.Components || [];
            const cityComponent = components.find((c) => c.kind === 'locality');
            const rawCityName =
               cityComponent?.name || geoObject.name || normalized;

            return {
               lat,
               lon,
               cityName: normalizeCityName(rawCityName),
            };
         }

         debugAttempts.push({ query, results: debugKinds });
      } catch (err) {
         logger.error(
            { err, city: normalized, query },
            'Yandex Geocoder: Error geocoding city',
         );
         debugAttempts.push({ query, results: [] });
      }
   }

   logger.warn(
      { city: normalized, attempts: debugAttempts },
      'Yandex Geocoder: No locality found across all attempts',
   );
   return null;
};
/**
 * Zod-схема для импорта поездки от Python парсера.
 */
const importTripSchema = z.object({
   // Python парсер может прислать город с хвостовым пробелом или NBSP — трим
   // до валидации, иначе точный match по canonical_ru/uz/en разваливается
   // и мы зря идём на Яндекс с "Andijan " вместо "Andijan".
   from_city: z
      .string()
      .transform((v) => v.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(1, 'from_city is required')),
   to_city: z
      .string()
      .transform((v) => v.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(1, 'to_city is required')),
   phone: z
      .string()
      .regex(
         /^\+998[0-9]{9}$/,
         'Invalid phone format. Expected: +998XXXXXXXXX',
      ),
   first_name: z.string().min(1).max(32),
   last_name: z.string().max(32).optional(),
   car_model: z.string().optional(),
   car_make: z.string().optional(),
   car_number: z.string().optional(),
   price: z.number().positive('Price must be positive').optional(),
   seats_available: z.number().int().positive().default(3),
   baggage: z
      .enum(['FULL', 'HALF_EMPTY', 'EMPTY', 'full', 'half_empty', 'empty'])
      .optional()
      .transform((val) => (val ? val.toUpperCase() : undefined)),
   pick_up_from_home: z.boolean().default(false),
   food_stop: z.boolean().default(false),
   smoking: z.boolean().default(false),
   air_conditioner: z.boolean().default(false),
   departure_ts: z.coerce.date().optional(),
   comment: z.string().max(256).optional(),
   arrival_ts: z.coerce.date().optional(),
   tg_user: z.coerce.string().optional(),
});

export type ImportTripDto = z.infer<typeof importTripSchema>;

export const importTripFromExternal = async (body: unknown) => {
   const data = importTripSchema.parse(body);

   // Шаг 1: сначала пытаемся распознать имя города по нашей БД (canonical_ru/
   // uz/en + aliases). Если парсер прислал узнаваемое имя — берём центр сразу,
   // минуя Яндекс. Яндекс на "Andijan"/"Navoiy" иногда отдаёт одноимённый
   // мелкий кишлак в другом регионе: strict bbox потом не срабатывает, импорт
   // падает 500-кой, хотя фактически имя — валидный город.
   // Яндекс остаётся fallback-ом только для названий, которых нет в БД.
   const resolveCityName = async (
      rawName: string,
   ): Promise<{
      city: { id: string; canonical_uz: string; lat: number; lon: number };
      source: 'db' | 'yandex';
   }> => {
      const direct = await cityRepository.findCityByName(rawName);
      if (direct && direct.lat != null && direct.lon != null) {
         return {
            city: {
               id: direct.id,
               canonical_uz: direct.canonical_uz,
               lat: direct.lat,
               lon: direct.lon,
            },
            source: 'db',
         };
      }

      const geo = await getCityGeoData(rawName);
      if (!geo) {
         throw new BadRequestError(
            `Unknown city: "${rawName}". Not found in DB; Yandex did not return a locality in UZ.`,
            ErrorCode.TRIP_IMPORT_INVALID_PAYLOAD,
         );
      }
      const resolved = await cityResolver.resolveStrictByPoint(
         geo.lon,
         geo.lat,
      );
      if (!resolved || resolved.lat == null || resolved.lon == null) {
         throw new BadRequestError(
            `City "${rawName}" geocoded to (${geo.lat}, ${geo.lon}) but did not fall into any city bbox.`,
            ErrorCode.GEO_ADDRESS_NOT_FOUND,
         );
      }

      return {
         city: {
            id: resolved.id,
            canonical_uz: resolved.canonical_uz,
            lat: resolved.lat,
            lon: resolved.lon,
         },
         source: 'yandex',
      };
   };

   const [fromResolved, toResolved] = await Promise.all([
      resolveCityName(data.from_city),
      resolveCityName(data.to_city),
   ]);

   const fromCity = fromResolved.city;
   const toCity = toResolved.city;

   logger.info(
      {
         from: data.from_city,
         to: data.to_city,
         fromSource: fromResolved.source,
         toSource: toResolved.source,
      },
      'Trip import: cities resolved',
   );

   // Координаты — центр города из БД (гарантированно внутри bbox, триггер
   // fill_trip_geo_fields подтвердит from_city_id/to_city_id).
   const fromLat = fromCity.lat;
   const fromLon = fromCity.lon;
   const toLat = toCity.lat;
   const toLon = toCity.lon;

   // Если departure_ts не указан — ставим завтра 08:00 UZT (03:00 UTC)
   const departureTs =
      data.departure_ts ||
      (() => {
         const futureDate = new Date();
         futureDate.setUTCDate(futureDate.getUTCDate() + 1);
         futureDate.setUTCHours(3, 0, 0, 0);
         return futureDate;
      })();

   // Если парсер прислал arrival_ts — берём его как авторитетный (он знает
   // фактическое время прибытия из объявления). Иначе ставим дефолт +6ч —
   // средняя межгородняя поездка по UZ; используется только когда парсер
   // не смог распарсить время прибытия из текста.
   const arrivalTs =
      data.arrival_ts || new Date(departureTs.getTime() + 6 * 60 * 60 * 1000);
   const durationMinutes = Math.max(
      1,
      Math.round((arrivalTs.getTime() - departureTs.getTime()) / 60000),
   );
   const result = await withDeadlockRetry(async (t) => {
      let user = await userRepository.findUserByPhoneNumber(data.phone, t);

      let isNewUser = false;

      if (!user) {
         user = await userRepository.createUser(
            {
               firstName: data.first_name,
               lastName: data.last_name,
               phoneNumber: data.phone,
               role: UserRole.Driver,
               verified: true,
               registration_source: RegistrationSource.FromBot,
               tg_user: data.tg_user,
            },
            t,
         );
         isNewUser = true;

         await walletRepository.createWallet(
            { userId: user.id, balance: 0 },
            t,
         );

         logger.info(
            { userId: user.id, phone: data.phone },
            'Created external driver from import',
         );
      } else {
         let needsSave = false;

         if (user.role === UserRole.Passenger) {
            user.role = UserRole.Driver;
            needsSave = true;

            await walletRepository.createWallet(
               { userId: user.id, balance: 0 },
               t,
            );
         }

         // tg_user всегда перезаписываем значением из парсера, когда оно
         // пришло: Telegram-аккаунт водителя мог появиться или смениться
         // между ре-скрапами одного и того же объявления.
         if (data.tg_user) {
            user.tg_user = data.tg_user;
            needsSave = true;
         }

         if (needsSave) {
            await userRepository.saveUser(user, t);
         }
      }

      // Reconciliation ДО дедупа: ищем прогноз того же водителя/маршрута на этот
      // день. Если нашли — реальная публикация «повышает» его на месте (ниже):
      // тот же трип теряет метку, новый НЕ создаётся, дедуп пропускаем. Иначе
      // прогноз попал бы под дедуп и реальный импорт был бы пропущен как «дубль».
      const matchedPrediction = await predictor.findMatchingPrediction(
         {
            driverId: user.id,
            fromCityId: fromCity.id,
            toCityId: toCity.id,
            departureTs,
         },
         t,
      );

      // Машину ищем по госномеру ДО дедупа/повышения: car_number — стабильный
      // ключ одного объявления (даже если координаты разъехались). Нужна и для
      // дедупа уровня 1, и для данных трипа (создание/повышение).
      let car: Car | null = null;

      if (data.car_number) {
         car = await carRepository.findCarByGovNumber(
            user.id,
            data.car_number,
            t,
         );
      }

      // Дедупликация запускается ТОЛЬКО когда нет прогноза для повышения: если
      // matchedPrediction найден, реальный импорт повышает его на месте (новый
      // трип не создаём), поэтому дедуп-проверки не нужны. Прогнозы в дедупе не
      // участвуют (is_predicted:false) — у них отдельный путь (повышение).
      //
      // Дедуп в два уровня — гео-дедуп (масштабируется на любое написание
      // городов) + строгий дедуп по машине/маршруту (ловит дрейф координат между
      // ре-скрапами одного объявления). Общие критерии: тот же водитель,
      // departure_ts в окне ±2ч, активный статус (CREATED/IN_PROGRESS).
      if (!matchedPrediction) {
         const dedupWindowMs = 2 * 60 * 60 * 1000;
         const tsLow = new Date(departureTs.getTime() - dedupWindowMs);
         const tsHigh = new Date(departureTs.getTime() + dedupWindowMs);
         const DEDUP_RADIUS_METERS = 5000;

         // Уровень 1: тот же водитель + машина (gov_number) + пара city_id + окно.
         if (car) {
            const duplicateByCar =
               await tripRepository.findActiveImportDuplicateByCar(
                  {
                     driverId: user.id,
                     carId: car.id,
                     fromCityId: fromCity.id,
                     toCityId: toCity.id,
                     tsLow,
                     tsHigh,
                  },
                  t,
               );

            if (duplicateByCar) {
               logger.info(
                  {
                     tripId: duplicateByCar.id,
                     driverId: user.id,
                     carId: car.id,
                     carNumber: data.car_number,
                     from: fromCity.canonical_uz,
                     to: toCity.canonical_uz,
                     departureTs,
                  },
                  'Skipping duplicate trip import — same driver/car/route/time',
               );
               return null;
            }
         }

         // Уровень 2: гео-дедуп (5 км) — когда номер не пришёл/машины ещё нет.
         const duplicateTrip =
            await tripRepository.findActiveImportDuplicateByGeo(
               {
                  driverId: user.id,
                  tsLow,
                  tsHigh,
                  fromLon,
                  fromLat,
                  toLon,
                  toLat,
                  radiusMeters: DEDUP_RADIUS_METERS,
               },
               t,
            );

         if (duplicateTrip) {
            logger.info(
               {
                  tripId: duplicateTrip.id,
                  driverId: user.id,
                  from: fromCity.canonical_uz,
                  to: toCity.canonical_uz,
                  departureTs,
               },
               'Skipping duplicate trip import — active trip with same route already exists',
            );
            return null;
         }
      }

      if (!car) {
         car = await carRepository.findCarByDriverMakeModel(
            user.id,
            data.car_make,
            data.car_model,
            t,
         );
      }

      if (!car) {
         car = await carRepository.createCar(
            {
               driver_id: user.id,
               govNumber: data.car_number || undefined,
               make: data.car_make || undefined,
               model: data.car_model || undefined,
               seats: data.seats_available,
               status: CarStatus.VERIFIED,
               // Placeholder для обязательных полей — внешние водители не загружают документы
               techPassportFrontPath: 'imported/placeholder',
               techPassportBackPath: 'imported/placeholder',
            },
            t,
         );

         logger.info(
            { carId: car.id, driverId: user.id },
            'Created car for external driver',
         );
      }

      // 3. Данные трипа из объявления (общие для создания и повышения прогноза)
      const garageValue = data.baggage as GarageStatus | undefined;

      const tripData = {
         driver_id: user.id,
         car_id: car.id,

         from_city: fromCity.canonical_uz,
         to_city: toCity.canonical_uz,

         from_city_id: fromCity.id,
         to_city_id: toCity.id,

         from_latitude: fromLat,
         from_longitude: fromLon,
         to_latitude: toLat,
         to_longitude: toLon,

         from_address: '',
         to_address: '',

         departure_ts: departureTs,
         arrival_ts: arrivalTs,
         duration: durationMinutes,
         seats_available: data.seats_available,
         price_per_person: data.price || 0,
         max_two_back: false,

         booking_type: BookingType.request,

         conditioner: data.air_conditioner,
         smoking_allowed: data.smoking,
         door_pickup: data.pick_up_from_home,
         food_stop: data.food_stop,
         garage: garageValue || GarageStatus.Empty,

         comment: data.comment || '',
      };

      // Прогноз найден → «повышаем» его на месте (тот же трип теряет метку, id
      // сохраняется, брони/чаты на нём остаются). Иначе создаём новый трип.
      const trip = matchedPrediction
         ? await predictor.promotePrediction(matchedPrediction, tripData, t)
         : await tripRepository.createTrip(tripData, t);

      return {
         trip: formatTripResponse(trip, null),
         driver: {
            id: user.id,
            phone: user.phoneNumber,
            isNew: isNewUser,
         },
         car: {
            id: car.id,
            make: car.make,
            model: car.model,
            govNumber: car.govNumber,
         },
      };
   });

   if (!result) {
      return null;
   }

   // Инвалидация кеша ПОСЛЕ commit — чтобы параллельный поиск
   // не закэшировал выдачу без свежеимпортированного трипа.
   clearCache('trip:search:*').catch((err) =>
      logger.warn({ err }, 'Cache invalidation failed'),
   );

   logger.info(
      {
         tripId: result.trip.id,
         driverId: result.driver.id,
         from: data.from_city,
         to: data.to_city,
      },
      'Trip imported from external source',
   );

   // Предиктор — ПОСЛЕ commit, в собственной транзакции: обновляет паттерн
   // регулярности по этому трипу и, если водитель признан регулярным, досоздаёт
   // прогнозы на горизонт. Любой сбой здесь НЕ влияет на приём трипа — он уже
   // зафиксирован (fire-and-forget с логированием). Так предиктор физически не
   // может сломать импорт: в самой транзакции приёма остаются лишь поиск прогноза
   // (read) и — только для регулярных водителей — повышение прогноза на месте.
   predictor
      .process(result.trip.id)
      .catch((err) =>
         logger.error(
            { err, tripId: result.trip.id },
            'Predictor: post-commit process failed — import unaffected',
         ),
      );

   return result;
};
