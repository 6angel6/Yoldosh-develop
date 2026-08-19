'use strict';

/**
 * Ужимаем fallback «ближайший центр города» в триггере fill_trip_geo_fields
 * с 50 км до 15 км. Это срабатывает только когда сервис создания трипа не
 * передал city_id и bbox-match пустой — в такой ситуации 50 км в плотном UZ
 * рискуют притянуть точку к чужому соседнему городу (Фергана-Маргилан ~15км,
 * Хива-Ургенч ~30км). 15 км совпадает с радиусом route-corridor в hybrid
 * search и даёт «близко к городу» без пересечения с соседями.
 *
 * Основная функция триггера, обработка from_geo/to_geo/route_geo и первичный
 * bbox-match остаются без изменений.
 */
module.exports = {
   async up(queryInterface) {
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
               NEW.route_geo := ST_MakeLine(
                  NEW.from_geo::geometry,
                  NEW.to_geo::geometry
               )::geography;
            END IF;

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
                     AND ST_DWithin(c.center_geo, NEW.from_geo, 15000)
                   ORDER BY ST_Distance(c.center_geo, NEW.from_geo) ASC
                   LIMIT 1;
               END IF;
            END IF;

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
                     AND ST_DWithin(c.center_geo, NEW.to_geo, 15000)
                   ORDER BY ST_Distance(c.center_geo, NEW.to_geo) ASC
                   LIMIT 1;
               END IF;
            END IF;

            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);
   },

   async down(queryInterface) {
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
               NEW.route_geo := ST_MakeLine(
                  NEW.from_geo::geometry,
                  NEW.to_geo::geometry
               )::geography;
            END IF;

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
   },
};
