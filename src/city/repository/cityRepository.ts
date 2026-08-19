import { QueryTypes } from 'sequelize';
import db from '../../../shared/config/database';
import City from '../models/City';
import { cityTranslations } from '../../../shared/i18n/regionLocalization';

export interface CityRow {
   id: string;
   canonical_ru: string;
   canonical_uz: string;
   canonical_en: string | null;
   region: string | null;
   region_id: string | null;
   admin_level: number;
   kind: 'region' | 'city';
   search_radius_m: number;
   population: number | null;
   // lat/lon центра города берутся из center_geo в findCityByPoint/Nearest.
   // Нужны для импорта трипов: вместо произвольной точки от Яндекса мы
   // пишем авторитетный центр города — он гарантированно попадает в bbox,
   // поэтому триггер fill_trip_geo_fields корректно матчит city_id.
   lat?: number;
   lon?: number;
}

/**
 * Первичный резолв: точка внутри полигона города.
 *   - ST_Covers(bbox, point) — GiST на bbox_geo.
 *   - Фильтр kind='city' — регионы в этот срез не попадают, чтобы точка в
 *     центре области (вне конкретного города) не "резолвилась" в саму область.
 *     Волна "попадание в регион" идёт отдельной функцией `findRegionByPoint`.
 *   - Если точка попадает сразу в несколько городов (например, город-в-городе),
 *     берём наибольший admin_level — он означает более конкретную единицу.
 */
export async function findCityByPoint(
   lng: number,
   lat: number,
): Promise<CityRow | null> {
   const rows = await db.query<CityRow>(
      `
      SELECT id, canonical_ru, canonical_uz, canonical_en, region, region_id,
             admin_level, kind, search_radius_m, population,
             ST_Y(center_geo::geometry) AS lat,
             ST_X(center_geo::geometry) AS lon
        FROM cities
       WHERE is_active = true
         AND kind = 'city'
         AND bbox_geo IS NOT NULL
         AND ST_Covers(bbox_geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
       ORDER BY admin_level DESC
       LIMIT 1;
      `,
      { bind: [lng, lat], type: QueryTypes.SELECT },
   );
   return rows[0] ?? null;
}

/**
 * Fallback резолв: точка внутри полигона региона.
 * Запускается, когда findCityByPoint вернул null — точка есть в Узбекистане,
 * но вне всех городских полигонов (например, между населёнными пунктами или
 * в редкой деревне без OSM-полигона). Позволяет уйти во «вторую волну» поиска
 * по региону, не рискуя привязать к неправильному соседнему городу.
 */
export async function findRegionByPoint(
   lng: number,
   lat: number,
): Promise<CityRow | null> {
   const rows = await db.query<CityRow>(
      `
      SELECT id, canonical_ru, canonical_uz, canonical_en, region, region_id,
             admin_level, kind, search_radius_m, population
        FROM cities
       WHERE is_active = true
         AND kind = 'region'
         AND bbox_geo IS NOT NULL
         AND ST_Covers(bbox_geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
       ORDER BY ST_Area(bbox_geo::geometry) ASC
       LIMIT 1;
      `,
      { bind: [lng, lat], type: QueryTypes.SELECT },
   );
   return rows[0] ?? null;
}

/**
 * Последний fallback: ближайший центр города в радиусе.
 * Используется, когда точка вне всех полигонов (включая регион) — такое
 * бывает на границе страны или для редких кишлаков без OSM-полигона.
 * Регионы из этого срезки исключены, чтобы ранжирование не уходило в область.
 */
export async function findNearestCity(
   lng: number,
   lat: number,
   maxRadiusM = 50000,
): Promise<CityRow | null> {
   const rows = await db.query<CityRow>(
      `
      SELECT id, canonical_ru, canonical_uz, canonical_en, region, region_id,
             admin_level, kind, search_radius_m, population,
             ST_Y(center_geo::geometry) AS lat,
             ST_X(center_geo::geometry) AS lon,
             ST_Distance(center_geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
        FROM cities
       WHERE is_active = true
         AND kind = 'city'
         AND ST_DWithin(center_geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY dist_m ASC, admin_level DESC
       LIMIT 1;
      `,
      { bind: [lng, lat, maxRadiusM], type: QueryTypes.SELECT },
   );
   return rows[0] ?? null;
}

/**
 * Автокомплит по имени. Включает и города, и регионы (UI показывает оба
 * в выпадашке «куда поедем»).
 *   1) Точное вхождение в aliases (GIN-индекс) — ранг 0.
 *   2) Префиксное совпадение в aliases — ранг 1.
 *   3) Trigram-similarity по canonical_ru/uz — ранг 2.
 */
export async function searchCitiesByName(
   query: string,
   limit = 10,
): Promise<CityRow[]> {
   const normalized = query
      .toLowerCase()
      .replace(/[''ʻʼ`´]/g, '')
      .trim();
   if (!normalized) return [];

   return db.query<CityRow>(
      `
      SELECT id, canonical_ru, canonical_uz, canonical_en, region, region_id,
             admin_level, kind, search_radius_m, population,
             CASE
                WHEN $1 = ANY(aliases) THEN 0
                WHEN EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a LIKE $1 || '%') THEN 1
                ELSE 2
             END AS match_rank,
             GREATEST(
                similarity(LOWER(canonical_ru), $1),
                similarity(LOWER(canonical_uz), $1)
             ) AS sim
        FROM cities
       WHERE is_active = true
         AND (
              $1 = ANY(aliases)
           OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a LIKE $1 || '%')
           OR canonical_ru ILIKE '%' || $1 || '%'
           OR canonical_uz ILIKE '%' || $1 || '%'
         )
       ORDER BY match_rank ASC,
                -- Приоритет город > регион (в городах обычно начинают искать).
                CASE WHEN kind = 'city' THEN 0 ELSE 1 END,
                sim DESC,
                COALESCE(population, 0) DESC,
                admin_level DESC
       LIMIT $2;
      `,
      { bind: [normalized, limit], type: QueryTypes.SELECT },
   );
}

export async function findCityById(id: string): Promise<City | null> {
   return City.findByPk(id);
}

// Все варианты «апострофа», которые встречаются в OSM/Excel/ручном вводе:
//   U+0027 ' ASCII apostrophe         — name_uz из geojson
//   U+2018 ‘ left single quote        — osm_name из overpass (часто)
//   U+2019 ’ right single quote       — Excel/Sheets автозамена
//   U+02BB ʻ modifier turned comma    — каноничная узбекская латиница
//   U+02BC ʼ modifier apostrophe      — узбекская латиница, второй вариант
//   U+0060 ` grave accent             — корявый ввод
//   U+00B4 ´ acute accent             — корявый ввод
// JS-регекс и SQL-regex держим в синхроне, иначе нормализация на двух сторонах
// расходится и матч проваливается (как было: ‘/’ не стрипались нигде).
const APOSTROPHE_JS_REGEX = /['‘’ʻʼ`´]/g;
const APOSTROPHE_SQL_CLASS = `[''‘’ʻʼ\`´]`;

const normalizeForMatch = (raw: string): string =>
   raw.toLowerCase().replace(APOSTROPHE_JS_REGEX, '').trim();

const SELECT_CITY_COLS = `
   id, canonical_ru, canonical_uz, canonical_en, region, region_id,
   admin_level, kind, search_radius_m, population,
   ST_Y(center_geo::geometry) AS lat,
   ST_X(center_geo::geometry) AS lon
`;

// Областной центр первым, NULL population не должен уронить выбор к кишлаку.
const ORDER_BY_PRIORITY = `
   CASE WHEN COALESCE(population, 0) >= 50000 THEN 0 ELSE 1 END,
   COALESCE(population, 0) DESC,
   admin_level DESC
`;

/**
 * Pass 1: байтовый матч (только LOWER, без стрипа апострофов).
 * Ловит случай, когда парсер прислал ровно ту же форму, что лежит в DB
 * или в aliases (включая osm_name с U+2018 — он туда попадает as-is).
 */
const lookupByRawName = async (lowered: string): Promise<CityRow | null> => {
   const rows = await db.query<CityRow>(
      `
      SELECT ${SELECT_CITY_COLS}
        FROM cities
       WHERE is_active = true
         AND kind = 'city'
         AND center_geo IS NOT NULL
         AND (
              LOWER(canonical_ru) = $1
           OR LOWER(canonical_uz) = $1
           OR LOWER(COALESCE(canonical_en, '')) = $1
           OR EXISTS (
               SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) = $1
           )
         )
       ORDER BY ${ORDER_BY_PRIORITY}
       LIMIT 1;
      `,
      { bind: [lowered], type: QueryTypes.SELECT },
   );
   return rows[0] ?? null;
};

/**
 * Pass 2: агрессивный матч — REGEXP_REPLACE снимает все варианты апострофа
 * и в столбцах, и во входе. Закрывает кейс, когда парсер прислал «Qo'qon»
 * (U+2019), а в DB лежит «Qo'qon» (ASCII) — раньше REPLACE-цепочка ловила
 * только ASCII и оба не сводились к одной форме.
 */
const lookupByExactName = async (
   normalized: string,
): Promise<CityRow | null> => {
   const rows = await db.query<CityRow>(
      `
      SELECT ${SELECT_CITY_COLS}
        FROM cities
       WHERE is_active = true
         AND kind = 'city'
         AND center_geo IS NOT NULL
         AND (
              LOWER(REGEXP_REPLACE(canonical_ru, '${APOSTROPHE_SQL_CLASS}', '', 'g')) = $1
           OR LOWER(REGEXP_REPLACE(canonical_uz, '${APOSTROPHE_SQL_CLASS}', '', 'g')) = $1
           OR LOWER(REGEXP_REPLACE(COALESCE(canonical_en, ''), '${APOSTROPHE_SQL_CLASS}', '', 'g')) = $1
           OR EXISTS (
               SELECT 1 FROM unnest(aliases) a
                WHERE LOWER(REGEXP_REPLACE(a, '${APOSTROPHE_SQL_CLASS}', '', 'g')) = $1
           )
         )
       ORDER BY ${ORDER_BY_PRIORITY}
       LIMIT 1;
      `,
      { bind: [normalized], type: QueryTypes.SELECT },
   );
   return rows[0] ?? null;
};

/**
 * Точный name-lookup города. Используется импортом трипов: если парсер
 * прислал известное имя ("Andijan"/"Navoiy"/"Ташкент"), берём центр города
 * из нашей таблицы и полностью избегаем Яндекса. Яндекс для этих имён
 * иногда отдаёт одноимённый мелкий кишлак в другом регионе ("Навои" →
 * деревня в Ферганской долине), что валит последующий bbox-match.
 *
 * Логика матча в три прохода:
 *   1) Pass 1 — байтовый матч с LOWER. Если парсер прислал точно ту форму,
 *      что лежит в canonical_ru/uz/en или aliases (включая osm_name
 *      с U+2018), берём без стрипа.
 *   2) Pass 2 — агрессивная нормализация: с обеих сторон вырезаем все
 *      варианты апострофа (ASCII, U+2018, U+2019, ʻ, ʼ, grave, acute).
 *      Сводит «Qo'qon»/«Qo‘qon»/«Qo’qon»/«Qoʻqon»/«Qoqon» в одну строку.
 *   3) Pass 3 — fallback через cityTranslations (shared/i18n): вдруг
 *      сиды cities пропустили какой-то вариант имени, но он есть
 *      в in-memory словаре — пробуем все три формы (ru/uz/en).
 *
 * Сортировка во всех проходах: города с population ≥ 50k (областные центры)
 * идут первыми, чтобы «областной центр + кишлак-омоним» не отдавал кишлак.
 */
export async function findCityByName(name: string): Promise<CityRow | null> {
   const trimmed = name.trim();
   if (!trimmed) return null;

   const raw = await lookupByRawName(trimmed.toLowerCase());
   if (raw) return raw;

   const direct = await lookupByExactName(normalizeForMatch(trimmed));
   if (direct) return direct;

   const entry =
      cityTranslations[trimmed] ||
      Object.entries(cityTranslations).find(
         ([key]) => key.toLowerCase() === trimmed.toLowerCase(),
      )?.[1];
   if (!entry) return null;

   const tried = new Set<string>();
   for (const form of [entry.ru, entry.uz, entry.en]) {
      const lowered = form.trim().toLowerCase();
      const norm = normalizeForMatch(form);
      if (lowered && !tried.has(`raw:${lowered}`)) {
         tried.add(`raw:${lowered}`);
         const hit = await lookupByRawName(lowered);
         if (hit) return hit;
      }
      if (norm && !tried.has(`norm:${norm}`)) {
         tried.add(`norm:${norm}`);
         const hit = await lookupByExactName(norm);
         if (hit) return hit;
      }
   }
   return null;
}
