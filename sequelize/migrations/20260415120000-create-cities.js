'use strict';

/**
 * Справочник городов Узбекистана — единая точка резолва «координаты → город».
 *
 * Подход: bbox_geo хранит реальный OSM-полигон административной границы,
 * center_geo — центроид (fallback когда точка вне всех полигонов).
 * aliases покрывают RU/UZ/EN/транслит варианты для автокомплита по имени.
 */
module.exports = {
   async up(queryInterface, Sequelize) {
      await queryInterface.sequelize.query(`
         CREATE EXTENSION IF NOT EXISTS postgis;
         CREATE EXTENSION IF NOT EXISTS pg_trgm;
      `);

      await queryInterface.sequelize.query(`
         CREATE TABLE IF NOT EXISTS cities (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            osm_id          bigint UNIQUE,
            admin_level     smallint NOT NULL,
            canonical_ru    text NOT NULL,
            canonical_uz    text NOT NULL,
            canonical_en    text,
            region          text,
            center_geo      geography(Point, 4326) NOT NULL,
            bbox_geo        geography(MultiPolygon, 4326),
            search_radius_m integer NOT NULL DEFAULT 20000,
            population      integer,
            aliases         text[] NOT NULL DEFAULT '{}',
            is_active       boolean NOT NULL DEFAULT true,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
         );
      `);

      // bbox_geo — первичный резолв ST_Covers(bbox, point)
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_bbox_gist
            ON cities USING GIST (bbox_geo);
      `);

      // center_geo — fallback ST_DWithin и ранжирование в Волне 2 поиска
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_center_gist
            ON cities USING GIST (center_geo);
      `);

      // aliases — автокомплит по точному вхождению токена
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_aliases_gin
            ON cities USING GIN (aliases);
      `);

      // trigram на канонические имена — fuzzy-автокомплит с опечатками
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_canonical_ru_trgm
            ON cities USING GIN (canonical_ru gin_trgm_ops);
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_canonical_uz_trgm
            ON cities USING GIN (canonical_uz gin_trgm_ops);
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_active
            ON cities (is_active) WHERE is_active = true;
      `);

      console.log('✅ Migration completed: cities table + GiST/GIN indexes');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS cities CASCADE;`);
      console.log('✅ Rollback completed: cities table dropped');
   },
};
