'use strict';

/**
 * Добавляет в trips:
 *   - from_city_id / to_city_id (FK cities, nullable на переход)
 *   - route_geo (LINESTRING) — коридор для транзитного поиска
 * Обновляет trigger fill_trip_geo_fields — добавляет ST_MakeLine.
 * Индексы под новые WHERE-условия поиска.
 */
module.exports = {
   async up(queryInterface) {
      // 1. Новые колонки (nullable — чтобы не ломать существующие строки)
      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            ADD COLUMN IF NOT EXISTS from_city_id uuid REFERENCES cities(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS to_city_id   uuid REFERENCES cities(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS route_geo    geography(LINESTRING, 4326);
      `);

      // 2. Обновляем триггер — добавляем построение route_geo из from/to
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

            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);

      // 3. Backfill route_geo для существующих активных поездок
      await queryInterface.sequelize.query(`
         UPDATE trips
         SET route_geo = ST_MakeLine(from_geo::geometry, to_geo::geometry)::geography
         WHERE route_geo IS NULL
           AND from_geo IS NOT NULL
           AND to_geo IS NOT NULL;
      `);

      // 4. GiST на route_geo — для ST_DWithin в транзитном поиске
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_route_geo_gist
            ON trips USING GIST (route_geo);
      `);

      // 5. Композитный partial-индекс для Волны 1 (exact city-pair) — горячий путь
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_city_pair_departure
            ON trips (from_city_id, to_city_id, departure_ts)
            WHERE status IN ('CREATED', 'IN_PROGRESS')
              AND from_city_id IS NOT NULL
              AND to_city_id IS NOT NULL;
      `);

      console.log('✅ Migration completed: trips city FKs + route_geo + trigger');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_trips_city_pair_departure;`);
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_trips_route_geo_gist;`);

      // Откатываем триггер к исходной версии (без route_geo)
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
            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);

      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            DROP COLUMN IF EXISTS from_city_id,
            DROP COLUMN IF EXISTS to_city_id,
            DROP COLUMN IF EXISTS route_geo;
      `);

      console.log('✅ Rollback completed: trips city FKs + route_geo removed');
   },
};
