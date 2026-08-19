import axios, { AxiosError } from 'axios';
import logger from '../../utils/logger';
import { YANDEX_GEOCODER, YANDEX_URL } from './yandexConfig';
import { AppError, ServiceUnavailableError } from '../../utils/errorHandler';
import { ErrorCode } from '../../utils/errorCodes';
import { getOrSetCache } from '../../config/redis';
import { measureExternalCall } from '../../utils/appMetrics';
import {
   keepAliveHttpAgent,
   keepAliveHttpsAgent,
} from '../../utils/httpAgents';

const COORDS_TO_ADDRESS_CACHE_TTL = 90 * 24 * 60 * 60; // 90 дней
const ADDRESS_TO_COORDS_CACHE_TTL = 7 * 24 * 60 * 60; // 7 дней

// Геокодер стоит в горячем пути createTrip/createBooking: пассажир ждёт
// ответа синхронно, поэтому висеть на внешнем сервисе дольше трёх секунд
// нельзя — лучше отдать 503.
const GEOCODER_TIMEOUT_MS = 3000;

const roundCoordinate = (coord: number, precision: number = 4): number => {
   return Math.round(coord * Math.pow(10, precision)) / Math.pow(10, precision);
};

const normalizeAddress = (address: string): string => {
   return address
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Множественные пробелы → один
      .replace(/[.,;:]+/g, ','); // Нормализация пунктуации
};

export type GeocoderKind =
   | 'house'
   | 'street'
   | 'metro'
   | 'district'
   | 'locality';

export type GeocoderLang =
   | 'ru_RU'
   | 'uk_UA'
   | 'be_BY'
   | 'en_RU'
   | 'en_US'
   | 'tr_TR';

export type GeocoderSco = 'longlat' | 'latlong';

export interface GeocoderRequestParams {
   geocode: string;
   lang?: GeocoderLang;
   format?: 'json';
   apikey?: string;

   kind?: GeocoderKind;
   sco?: GeocoderSco;

   rspn?: 0 | 1;
   ll?: string;
   spn?: string;
   bbox?: string;

   results?: number;
   skip?: number;
   uri?: string;
}

interface GeocoderAddressComponent {
   kind: string;
   name: string;
}

interface GeocoderAddress {
   country_code: string;
   formatted: string;
   Components: GeocoderAddressComponent[];
}

interface GeocoderMetaData {
   precision: string;
   text: string;
   kind: string;
   Address: GeocoderAddress;
}

interface GeocoderGeoObject {
   metaDataProperty: {
      GeocoderMetaData: GeocoderMetaData;
   };
   name: string;
   description?: string;
   boundedBy: {
      Envelope: {
         lowerCorner: string;
         upperCorner: string;
      };
   };
   uri?: string;
   Point: {
      pos: string;
   };
}

interface GeocoderResponseFeatureMember {
   GeoObject: GeocoderGeoObject;
}

interface GeocoderResponseMetaData {
   fix?: string;
   request: string;
   suggest?: string;
   found: string;
   results: string;
   skip: string;
   Point?: {
      pos: string;
   };
}

export interface GeocoderSuccessResponse {
   response: {
      GeoObjectCollection: {
         metaDataProperty: {
            GeocoderResponseMetaData: GeocoderResponseMetaData;
         };
         featureMember: GeocoderResponseFeatureMember[];
      };
   };
}

export const geocode = async (
   params: Omit<GeocoderRequestParams, 'apikey' | 'format'>,
   isReverseGeocode: boolean = false,
): Promise<GeocoderSuccessResponse | null> => {
   const cacheTTL = isReverseGeocode
      ? COORDS_TO_ADDRESS_CACHE_TTL
      : ADDRESS_TO_COORDS_CACHE_TTL;

   let normalizedGeocode = params.geocode;

   if (isReverseGeocode) {
      const [lon, lat] = params.geocode.split(',').map(Number);
      if (!isNaN(lon) && !isNaN(lat)) {
         normalizedGeocode = `${roundCoordinate(lon)},${roundCoordinate(lat)}`;
      }
   } else {
      normalizedGeocode = normalizeAddress(params.geocode);
   }

   const cacheKey = `geocode:${normalizedGeocode}:${params.kind || 'none'}:${params.lang || 'ru_RU'}`;

   return await getOrSetCache(
      cacheKey,
      async () => {
         const requestParams: GeocoderRequestParams = {
            ...params,
            apikey: YANDEX_GEOCODER,
            format: 'json',
            lang: params.lang || 'ru_RU',
         };

         try {
            logger.info(
               { params: { ...requestParams, apikey: '***' } },
               'Sending request to Yandex Geocoder',
            );

            const response = await measureExternalCall('yandex_geocoder', () =>
               axios.get<GeocoderSuccessResponse>(YANDEX_URL, {
                  params: requestParams,
                  timeout: GEOCODER_TIMEOUT_MS,
                  httpAgent: keepAliveHttpAgent,
                  httpsAgent: keepAliveHttpsAgent,
               }),
            );

            if (
               !response.data ||
               !response.data.response?.GeoObjectCollection
            ) {
               logger.warn(
                  { responseData: response.data, params: requestParams },
                  'Yandex Geocoder returned unexpected response structure',
               );
               throw new ServiceUnavailableError(
                  'Geocoder service returned invalid data.',
                  ErrorCode.GEO_SERVICE_UNAVAILABLE,
               );
            }

            logger.info(
               {
                  found: response.data.response.GeoObjectCollection
                     .metaDataProperty.GeocoderResponseMetaData.found,
                  request: params.geocode,
               },
               'Yandex Geocoder request successful',
            );
            return response.data;
         } catch (error) {
            const err = error as AxiosError;
            logger.error(
               {
                  err: err.response?.data || err.message,
                  status: err.response?.status,
                  requestParams: { ...requestParams, apikey: '***' },
               },
               'Yandex Geocoder API request failed',
            );

            if (err.response?.status === 403) {
               throw new AppError(
                  'Invalid Yandex Geocoder API Key or restrictions failed.',
                  403,
               );
            }
            if (err.response?.status === 400) {
               throw new AppError(
                  `Bad request to Yandex Geocoder: ${JSON.stringify(err.response?.data)}`,
                  400,
               );
            }

            throw new ServiceUnavailableError(
               'Failed to contact Yandex Geocoder service.',
               ErrorCode.GEO_SERVICE_UNAVAILABLE,
            );
         }
      },
      cacheTTL,
   );
};

export const getCoordsFromAddress = async (address: string) => {
   return geocode({ geocode: address, results: 1 }, false);
};

/**
 * Bounding box Узбекистана в формате Yandex Geocoder: "lon1,lat1~lon2,lat2".
 * Юго-западный угол (Сурхандарья) → северо-восточный угол (Каракалпакстан/Фергана).
 * Используется для ограничения области поиска при геокодировании городов.
 */
const UZBEKISTAN_BBOX = '55.99,37.18~73.14,45.60';

/**
 * Геокодирование названия города на территории Узбекистана.
 *
 * Контекст для Яндекс.Геокодера — "этот топоним ищем в Узбекистане":
 *  - `bbox` + `rspn=1` — результаты жёстко ограничены bbox Узбекистана;
 *    этого достаточно, чтобы отсечь, например, Навои/Ташкент из соседних
 *    стран и сам топоним-страну "Узбекистан" в топе результатов.
 *  - `results: 5` — топ-1 не всегда город (может прилететь район/улица
 *    с совпадающим именем). Берём расширенный список, а дальше вызывающий
 *    код итерирует по нему и выбирает первый топоним типа
 *    locality/province/area с country_code === 'UZ'.
 *
 * Параметр `kind` НЕ передаётся — по документации Яндекса он применяется
 * только при обратном геокодировании (координаты → адрес). Если передать
 * его с адресной строкой, Яндекс отвечает 400 Bad Request, запрос падает
 * и вызывающий код молча возвращает `null`.
 *
 * Префикс "Узбекистан, " тоже НЕ используется — при запросах в латинице
 * ("Uchkuduk", "Tashkent") Яндекс принимал такой запрос за саму страну
 * и возвращал `kind: country` первым результатом, что ломало валидацию.
 * Локализацию страны обеспечиваем bbox'ом, а не префиксом.
 */
export const getCityCoordsInUzbekistan = async (cityName: string) => {
   return geocode(
      {
         geocode: cityName.trim(),
         rspn: 1,
         bbox: UZBEKISTAN_BBOX,
         results: 15,
      },
      false,
   );
};

export const getAddressFromCoords = async (
   longitude: number,
   latitude: number,
   kind?: GeocoderKind,
) => {
   const geocodeString = `${longitude},${latitude}`;
   return geocode({ geocode: geocodeString, kind: kind, results: 1 }, true);
};
