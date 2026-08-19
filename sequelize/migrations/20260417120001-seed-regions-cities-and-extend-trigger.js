'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Фаза 3: импорт актуальных регионов и городов Узбекистана + автоматический
 * резолв from_city_id/to_city_id при INSERT/UPDATE через триггер.
 *
 * Источники:
 *   sequelize/seed-data/uzbekistan_regions.geojson — 14 фич (viloyat + Toshkent
 *     shahri + Qoraqalpog'iston). Все MultiPolygon, с name_uz/ru/en, osm_id.
 *   sequelize/seed-data/uzbekistan_cities_4.geojson — 212 фич (city/town/village).
 *
 * Порядок:
 *   1) INSERT регионов (kind='region', region_id=self после резолва).
 *   2) INSERT городов (kind='city').
 *   3) Резолв city.region_id через ST_Covers(region.bbox, city.center),
 *      tie-break — наибольшая площадь bbox (Toshkent city → Toshkent viloyati,
 *      а не Toshkent shahri, т.к. viloyati крупнее).
 *   4) Расширение триггера fill_trip_geo_fields — теперь он также вычисляет
 *      from_city_id/to_city_id по from_geo/to_geo (bbox-match + nearest-50км
 *      fallback). Работает на INSERT и при изменении lat/lon в UPDATE.
 *   5) Backfill trips: "UPDATE trips SET from_latitude=from_latitude" трогает
 *      каждую строку, триггер сам проставляет city_id.
 */

// --------- helpers ---------

function normalize(s) {
   if (!s) return '';
   return s
      .toLowerCase()
      .replace(/[''ʻʼ`´]/g, '')
      .replace(/ʼ/g, '')
      .replace(/g‘/g, 'g')
      .replace(/o‘/g, 'o')
      .replace(/\s+/g, ' ')
      .trim();
}

const CITY_SUFFIXES = /\s+(shahri|tumani|viloyati|city|region|area|district|респуbliкasi|respublikasi)$/i;

function buildAliases({ name_uz, name_en, name_ru, osm_name }) {
   const set = new Set();
   const push = (v) => {
      if (!v) return;
      const n = normalize(v);
      if (n) set.add(n);
      const stripped = v.replace(CITY_SUFFIXES, '').trim();
      if (stripped && stripped !== v) {
         const sn = normalize(stripped);
         if (sn) set.add(sn);
      }
   };
   push(name_uz);
   push(name_en);
   push(name_ru);
   push(osm_name);
   return [...set];
}

function radiusForPlace(place, adminLevel) {
   // Регионы (lvl 3/4) — широкий радиус fallback-поиска.
   if (adminLevel === 3) return 200000;
   if (adminLevel === 4) return 100000;
   // Городские поселения — по типу place (мы уважаем тип OSM).
   if (place === 'city') return 30000;
   if (place === 'town') return 15000;
   if (place === 'village') return 7000;
   return 20000;
}

// --------- migration ---------

module.exports = {
   async up(queryInterface) {
      const regionsPath = path.resolve(
         __dirname,
         '..',
         'seed-data',
         'uzbekistan_regions.geojson',
      );
      const citiesPath = path.resolve(
         __dirname,
         '..',
         'seed-data',
         'uzbekistan_cities_4.geojson',
      );

      if (!fs.existsSync(regionsPath) || !fs.existsSync(citiesPath)) {
         console.warn(
            '⚠️  geojson seed files missing, skipping import:',
            regionsPath,
            citiesPath,
         );
         return;
      }

      const regions = JSON.parse(fs.readFileSync(regionsPath, 'utf8'));
      const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

      // ---- 1. REGIONS ----
      let regionInserted = 0;
      for (const f of regions.features) {
         const p = f.properties;
         if (!f.geometry || !p.name_uz) continue;

         const lvl = parseInt(p.admin_level, 10) || 4;
         const aliases = buildAliases({
            name_uz: p.name_uz,
            name_en: p.name_en,
            name_ru: p.name_ru,
            osm_name: p.osm_name,
         });

         await queryInterface.sequelize.query(
            `
            INSERT INTO cities
               (osm_id, admin_level, canonical_uz, canonical_en, canonical_ru,
                search_radius_m, center_geo, bbox_geo, aliases, region, kind)
            VALUES (
               $1::bigint, $2::smallint, $3::text, $4::text, $5::text, $6::int,
               ST_Centroid(ST_GeomFromGeoJSON($7::text))::geography,
               ST_Multi(ST_GeomFromGeoJSON($7::text))::geography,
               $8::text[], $9::text, 'region'
            )
            ON CONFLICT (osm_id, kind) WHERE osm_id IS NOT NULL DO UPDATE
               SET canonical_uz = EXCLUDED.canonical_uz,
                   canonical_en = EXCLUDED.canonical_en,
                   canonical_ru = EXCLUDED.canonical_ru,
                   admin_level  = EXCLUDED.admin_level,
                   center_geo   = EXCLUDED.center_geo,
                   bbox_geo     = EXCLUDED.bbox_geo,
                   aliases      = EXCLUDED.aliases,
                   region       = EXCLUDED.region,
                   updated_at   = now();
            `,
            {
               bind: [
                  p.osm_id,
                  lvl,
                  p.name_uz,
                  p.name_en ?? null,
                  p.name_ru ?? p.name_uz,
                  radiusForPlace(null, lvl),
                  JSON.stringify(f.geometry),
                  aliases,
                  p.name_ru ?? p.name_uz,
               ],
            },
         );
         regionInserted++;
      }
      console.log(`✅ Regions inserted: ${regionInserted}`);

      // ---- 2. CITIES ----
      let cityInserted = 0;
      let citySkipped = 0;
      for (const f of cities.features) {
         const p = f.properties;
         if (!f.geometry || !p.name_uz) {
            citySkipped++;
            continue;
         }
         // admin_level у большинства null → применяем 6 как дефолт для city/town/village.
         // У Toshkent admin_level=4 в файле cities, но это отдельная сущность — kind='city'.
         const lvlRaw = parseInt(p.admin_level, 10);
         const lvl = Number.isFinite(lvlRaw) ? lvlRaw : 6;
         const aliases = buildAliases({
            name_uz: p.name_uz,
            name_en: p.name_en,
            name_ru: p.name_ru,
            osm_name: p.osm_name,
         });

         await queryInterface.sequelize.query(
            `
            INSERT INTO cities
               (osm_id, admin_level, canonical_uz, canonical_en, canonical_ru,
                search_radius_m, center_geo, bbox_geo, aliases, kind)
            VALUES (
               $1::bigint, $2::smallint, $3::text, $4::text, $5::text, $6::int,
               ST_Centroid(ST_GeomFromGeoJSON($7::text))::geography,
               CASE
                  WHEN GeometryType(ST_GeomFromGeoJSON($7::text))
                       IN ('POLYGON', 'MULTIPOLYGON')
                  THEN ST_Multi(ST_GeomFromGeoJSON($7::text))::geography
                  ELSE NULL
               END,
               $8::text[], 'city'
            )
            ON CONFLICT (osm_id, kind) WHERE osm_id IS NOT NULL DO UPDATE
               SET canonical_uz = EXCLUDED.canonical_uz,
                   canonical_en = EXCLUDED.canonical_en,
                   canonical_ru = EXCLUDED.canonical_ru,
                   admin_level  = EXCLUDED.admin_level,
                   center_geo   = EXCLUDED.center_geo,
                   bbox_geo     = EXCLUDED.bbox_geo,
                   aliases      = EXCLUDED.aliases,
                   updated_at   = now();
            `,
            {
               bind: [
                  p.osm_id,
                  lvl,
                  p.name_uz,
                  p.name_en ?? null,
                  p.name_ru ?? p.name_uz,
                  radiusForPlace(p.place, lvl),
                  JSON.stringify(f.geometry),
                  aliases,
               ],
            },
         );
         cityInserted++;
      }
      console.log(`✅ Cities inserted: ${cityInserted}, skipped: ${citySkipped}`);

      // ---- 3. Резолв city.region_id ----
      // Для каждого города находим регион, чей bbox покрывает центр города.
      // Tie-break: самый БОЛЬШОЙ по площади регион — Toshkent city попадёт
      // в Toshkent viloyati, а не в Toshkent shahri (тот полигон совпадает).
      await queryInterface.sequelize.query(`
         UPDATE cities city
            SET region_id = sub.region_id,
                region    = sub.region_name
           FROM (
              SELECT DISTINCT ON (c.id)
                     c.id         AS city_id,
                     r.id         AS region_id,
                     r.canonical_ru AS region_name
                FROM cities c
                JOIN cities r
                  ON r.kind = 'region'
                 AND r.bbox_geo IS NOT NULL
                 AND ST_Covers(r.bbox_geo, c.center_geo)
               WHERE c.kind = 'city'
               ORDER BY c.id, ST_Area(r.bbox_geo::geometry) DESC
           ) sub
          WHERE city.id = sub.city_id;
      `);

      // Регион сам себе региональный родитель — упрощает JOIN'ы в поиске.
      await queryInterface.sequelize.query(`
         UPDATE cities
            SET region_id = id,
                region    = canonical_ru
          WHERE kind = 'region';
      `);

      const [[seedStats]] = await queryInterface.sequelize.query(`
         SELECT
            COUNT(*) FILTER (WHERE kind = 'region')                             AS regions,
            COUNT(*) FILTER (WHERE kind = 'city')                               AS cities,
            COUNT(*) FILTER (WHERE kind = 'city' AND region_id IS NULL)         AS cities_orphan,
            COUNT(DISTINCT region_id) FILTER (WHERE kind = 'city')              AS distinct_regions_used
           FROM cities;
      `);
      console.log('✅ Seed linkage stats:', seedStats);

      // ---- 4. Расширяем триггер — автоматический резолв from_city_id/to_city_id ----
      await queryInterface.sequelize.query(`
         CREATE OR REPLACE FUNCTION fill_trip_geo_fields()
         RETURNS TRIGGER AS $$
         BEGIN
            -- from/to geography
            IF NEW.from_latitude IS NOT NULL AND NEW.from_longitude IS NOT NULL THEN
               NEW.from_geo := ST_SetSRID(ST_MakePoint(NEW.from_longitude, NEW.from_latitude), 4326)::geography;
            END IF;

            IF NEW.to_latitude IS NOT NULL AND NEW.to_longitude IS NOT NULL THEN
               NEW.to_geo := ST_SetSRID(ST_MakePoint(NEW.to_longitude, NEW.to_latitude), 4326)::geography;
            END IF;

            -- route_geo LINESTRING — для транзитной волны поиска
            IF NEW.from_geo IS NOT NULL AND NEW.to_geo IS NOT NULL THEN
               NEW.route_geo := ST_MakeLine(
                  NEW.from_geo::geometry,
                  NEW.to_geo::geometry
               )::geography;
            END IF;

            -- ---- from_city_id: резолв (bbox → fallback nearest 50км) ----
            -- Запускаем, если:
            --   a) строка новая (TG_OP='INSERT') и id пустой, или
            --   b) UPDATE и координаты реально поменялись, или
            --   c) city_id NULL при существующей координате (backfill)
            IF NEW.from_geo IS NOT NULL AND (
                  NEW.from_city_id IS NULL
               OR (TG_OP = 'UPDATE' AND (
                     NEW.from_latitude  IS DISTINCT FROM OLD.from_latitude
                  OR NEW.from_longitude IS DISTINCT FROM OLD.from_longitude
               ))
            ) THEN
               SELECT c.id INTO NEW.from_city_id
                 FROM cities c
                WHERE c.is_active = true
                  AND c.kind      = 'city'
                  AND c.bbox_geo IS NOT NULL
                  AND ST_Covers(c.bbox_geo, NEW.from_geo)
                ORDER BY c.admin_level DESC
                LIMIT 1;

               IF NEW.from_city_id IS NULL THEN
                  SELECT c.id INTO NEW.from_city_id
                    FROM cities c
                   WHERE c.is_active = true
                     AND c.kind      = 'city'
                     AND ST_DWithin(c.center_geo, NEW.from_geo, 50000)
                   ORDER BY ST_Distance(c.center_geo, NEW.from_geo) ASC
                   LIMIT 1;
               END IF;
            END IF;

            -- ---- to_city_id (симметрично) ----
            IF NEW.to_geo IS NOT NULL AND (
                  NEW.to_city_id IS NULL
               OR (TG_OP = 'UPDATE' AND (
                     NEW.to_latitude  IS DISTINCT FROM OLD.to_latitude
                  OR NEW.to_longitude IS DISTINCT FROM OLD.to_longitude
               ))
            ) THEN
               SELECT c.id INTO NEW.to_city_id
                 FROM cities c
                WHERE c.is_active = true
                  AND c.kind      = 'city'
                  AND c.bbox_geo IS NOT NULL
                  AND ST_Covers(c.bbox_geo, NEW.to_geo)
                ORDER BY c.admin_level DESC
                LIMIT 1;

               IF NEW.to_city_id IS NULL THEN
                  SELECT c.id INTO NEW.to_city_id
                    FROM cities c
                   WHERE c.is_active = true
                     AND c.kind      = 'city'
                     AND ST_DWithin(c.center_geo, NEW.to_geo, 50000)
                   ORDER BY ST_Distance(c.center_geo, NEW.to_geo) ASC
                   LIMIT 1;
               END IF;
            END IF;

            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);

      // ---- 5. Backfill: триггер проставит city_id для всех активных трипов ----
      // UPDATE с "SET lat=lat" запускает BEFORE UPDATE trigger, внутри которого
      // condition "from_city_id IS NULL" истинна (мы обнулили в Фазе 2).
      await queryInterface.sequelize.query(`
         UPDATE trips
            SET from_latitude = from_latitude
          WHERE from_latitude IS NOT NULL
            AND (from_city_id IS NULL OR to_city_id IS NULL);
      `);

      const [[backfillStats]] = await queryInterface.sequelize.query(`
         SELECT
            COUNT(*)                                          AS total,
            COUNT(from_city_id)                               AS with_from,
            COUNT(to_city_id)                                 AS with_to,
            COUNT(*) FILTER (WHERE from_city_id IS NULL)      AS missing_from,
            COUNT(*) FILTER (WHERE to_city_id IS NULL)        AS missing_to
           FROM trips
          WHERE deleted_at IS NULL
            AND status IN ('CREATED', 'IN_PROGRESS');
      `);
      console.log('✅ Trip city_id backfill stats (active trips):', backfillStats);
   },

   async down(queryInterface) {
      // Возвращаем триггер к предыдущему поведению (только geo + route, без city_id)
      await queryInterface.sequelize.query(`
         CREATE OR REPLACE FUNCTION fill_trip_geo_fields()
         RETURNS TRIGGER AS $$
         BEGIN
            IF NEW.from_latitude IS NOT NULL AND NEW.from_longitude IS NOT NULL THEN
               NEW.from_geo := ST_SetSRID(ST_MakePoint(NEW.from_longitude, NEW.from_latitude), 4326)::geography;
            END IF;
            IF NEW.to_latitude IS NOT NULL AND NEW.to_longitude IS NOT NULL THEN
               NEW.to_geo := ST_SetSRID(ST_MakePoint(NEW.to_longitude, NEW.to_latitude), 4326)::geography;
            END IF;
            IF NEW.from_geo IS NOT NULL AND NEW.to_geo IS NOT NULL THEN
               NEW.route_geo := ST_MakeLine(NEW.from_geo::geometry, NEW.to_geo::geometry)::geography;
            END IF;
            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);

      await queryInterface.sequelize.query(`DELETE FROM cities;`);
      console.log('✅ Rollback: cities data cleared, trigger reverted');
   },
};
