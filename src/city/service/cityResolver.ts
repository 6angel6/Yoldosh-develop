import * as cityRepository from '../repository/cityRepository';
import type { CityRow } from '../repository/cityRepository';
import logger from '../../../shared/utils/logger';

/**
 * CityResolver — единственный способ получить city_id из координат.
 * И водитель при создании поездки, и пассажир при поиске проходят через
 * этот сервис, чтобы строковые расхождения геокодера ("Toshkent" vs
 * "Ташкент") не ломали матчинг поездок.
 *
 * Все функции — строгие, без nearest-fallback. В плотном UZ соседи стоят
 * в 15-30км; любое «ближайший город» возвращало бы не тот ответ, что
 * имел в виду пользователь. Если точка вне полигонов — возвращаем null,
 * а не подменяем на ближайшего соседа.
 *
 * Для поиска `resolveSearchTarget(lng, lat)`:
 *   1) city bbox   → точное попадание в полигон города (Волна 1 поиска).
 *   2) region bbox → точка в области, но не в городе — city=null,
 *      Волна 2 (route-corridor) отработает по lat/lng.
 *   3) ничего не совпало → {city:null, region:null}, поиск пустой.
 */

// In-memory LRU-лайт кэш. Городов + регионов ~250, меняются крайне редко.
const MAX_CACHE = 512;
const cityByIdCache = new Map<string, CityRow>();
const cityByPointCache = new Map<string, CityRow | null>();
const searchTargetCache = new Map<string, SearchTarget>();

export interface SearchTarget {
   city: CityRow | null;
   region: CityRow | null;
   /**
    *  city   — точка внутри bbox города (идеальный случай, Волна 1).
    *  region — точка внутри bbox региона, но вне всех городов (для Волны 2).
    *  none   — точка вне всех полигонов UZ / не резолвится.
    */
   matchSource: 'city' | 'region' | 'none';
}

function cachePut<V>(map: Map<string, V>, key: string, val: V) {
   if (map.size >= MAX_CACHE) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
   }
   map.set(key, val);
}

function pointKey(lng: number, lat: number): string {
   // Округление до ~110м — шум геокодера внутри одной точки не ломает кэш
   return `${lng.toFixed(3)},${lat.toFixed(3)}`;
}

/**
 * Строгий резолв: ТОЛЬКО bbox-match, без nearest-fallback.
 *
 * Это ЕДИНСТВЕННАЯ точка резолва города из координат для создания и
 * обновления трипа (как водителем, так и при импорте). В плотном UZ
 * соседи стоят в 15-30км (Фергана/Маргилан, Хива/Ургенч, Ташкент/Чирчик) —
 * любой fallback через «ближайший центр» рискует привязать точку к чужому
 * городу. Бизнес-правило: если координата не попала в полигон ни одного
 * города, сервис обязан отказать пользователю («уточни место посадки»),
 * а не молча подменить на соседа.
 *
 * Кеш in-memory (pointKey округляет до ~110м) снимает нагрузку на БД при
 * повторных кликах одного и того же пользователя в одной локации.
 */
export async function resolveStrictByPoint(
   lng: number,
   lat: number,
): Promise<CityRow | null> {
   if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

   const key = pointKey(lng, lat);
   if (cityByPointCache.has(key)) return cityByPointCache.get(key) ?? null;

   const city = await cityRepository.findCityByPoint(lng, lat);
   cachePut(cityByPointCache, key, city);
   if (!city) {
      logger.warn({ lng, lat }, 'CityResolver: point is outside any city bbox');
   }
   return city;
}

/**
 * Резолв для пассажирского поиска трипов. Отдаёт city и region.
 *
 * Бизнес-правило: никакого nearest-fallback. Если точка не в полигоне
 * никакого города, city=null — Волна 1 поиска не запустится, дальше
 * отработает только route-corridor (Волна 2). Почему без nearest:
 * иначе пассажир в 20км от Ферганы получил бы from_city_id=Фергана,
 * и Wave 1 вернул бы любые Фергана→X трипы, хотя пассажир туда не
 * собирается. Лучше пустой результат, чем чужой город.
 *
 *   Волна 1 поиска ждёт city.id (exact city-pair).
 *   Волна 2 поиска — route-corridor, работает напрямую по lat/lng.
 *   region оставлен для справки/UI, на SQL не влияет.
 */
export async function resolveSearchTarget(
   lng: number,
   lat: number,
): Promise<SearchTarget> {
   const empty: SearchTarget = {
      city: null,
      region: null,
      matchSource: 'none',
   };
   if (!Number.isFinite(lng) || !Number.isFinite(lat)) return empty;

   const key = pointKey(lng, lat);
   const cached = searchTargetCache.get(key);
   if (cached) return cached;

   // 1. Пробуем точный город (самый сильный сигнал).
   const city = await cityRepository.findCityByPoint(lng, lat);
   if (city) {
      // Регион берём из FK — одно поле, без второго геозапроса.
      const region = city.region_id ? await findById(city.region_id) : null;
      const result: SearchTarget = {
         city,
         region,
         matchSource: 'city',
      };
      cachePut(searchTargetCache, key, result);
      return result;
   }

   // 2. Точка не в городе — может быть в области (между населёнными
   //    пунктами). city=null, Волна 2 отработает по коридору.
   const region = await cityRepository.findRegionByPoint(lng, lat);
   if (region) {
      const result: SearchTarget = {
         city: null,
         region,
         matchSource: 'region',
      };
      cachePut(searchTargetCache, key, result);
      return result;
   }

   logger.warn({ lng, lat }, 'CityResolver: no city/region matched point');
   cachePut(searchTargetCache, key, empty);
   return empty;
}

export async function searchByName(
   query: string,
   limit = 10,
): Promise<CityRow[]> {
   return cityRepository.searchCitiesByName(query, limit);
}

export async function findById(id: string): Promise<CityRow | null> {
   if (cityByIdCache.has(id)) return cityByIdCache.get(id) ?? null;
   const city = await cityRepository.findCityById(id);
   if (!city) return null;
   const row: CityRow = {
      id: city.id,
      canonical_ru: city.canonical_ru,
      canonical_uz: city.canonical_uz,
      canonical_en: city.canonical_en ?? null,
      region: city.region ?? null,
      region_id: city.region_id ?? null,
      admin_level: city.admin_level,
      kind: city.kind,
      search_radius_m: city.search_radius_m,
      population: city.population ?? null,
   };
   cachePut(cityByIdCache, id, row);
   return row;
}

export function clearCache(): void {
   cityByIdCache.clear();
   cityByPointCache.clear();
   searchTargetCache.clear();
}
