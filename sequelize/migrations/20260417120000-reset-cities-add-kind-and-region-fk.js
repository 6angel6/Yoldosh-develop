'use strict';

/**
 * Фаза 2 фиче-рефактора поиска городов.
 *
 *   1) Обнуляет trips.from_city_id / trips.to_city_id — готовимся к полной
 *      переимпортации справочника из свежих geojson. Старые id после
 *      удаления cities всё равно станут битыми (ON DELETE SET NULL
 *      отработал бы сам, но явный UPDATE детерминированнее).
 *   2) DELETE FROM cities — полная очистка справочника.
 *   3) ALTER cities:
 *       - region_id UUID (self-ref FK) — иерархия «город ∈ регион».
 *       - kind TEXT ('region' | 'city') — явное различение сущностей
 *         без привязки к admin_level (Toshkent — это и город, и регион).
 *       - Уникальность osm_id меняется на (osm_id, kind), т.к. один и тот же
 *         osm relation может участвовать в обоих срезах.
 */
module.exports = {
   async up(queryInterface) {
      // 1. Обнуляем city_id у всех трипов — после DELETE FROM cities они станут
      //    битыми даже с ON DELETE SET NULL, но явная операция предсказуемее.
      await queryInterface.sequelize.query(`
         UPDATE trips
            SET from_city_id = NULL,
                to_city_id   = NULL
          WHERE from_city_id IS NOT NULL
             OR to_city_id   IS NOT NULL;
      `);

      // 2. Выключаем FK-проверки (на всякий) и чистим справочник.
      await queryInterface.sequelize.query(`DELETE FROM cities;`);

      // 3. Схема: kind + region_id.
      await queryInterface.sequelize.query(`
         ALTER TABLE cities
            ADD COLUMN IF NOT EXISTS region_id uuid
               REFERENCES cities(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'city'
               CHECK (kind IN ('region', 'city'));
      `);

      // 4. Меняем уникальность osm_id → (osm_id, kind).
      await queryInterface.sequelize.query(`
         ALTER TABLE cities DROP CONSTRAINT IF EXISTS cities_osm_id_key;
      `);
      await queryInterface.sequelize.query(`
         CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_osm_kind_unique
            ON cities(osm_id, kind)
         WHERE osm_id IS NOT NULL;
      `);

      // 5. Индексы для резолва и обратного поиска «все города региона».
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_cities_region_id
            ON cities(region_id) WHERE region_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_cities_kind
            ON cities(kind);
      `);

      console.log('✅ cities: reset + region_id/kind added, osm_id unique → (osm_id, kind)');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`
         DROP INDEX IF EXISTS idx_cities_region_id;
         DROP INDEX IF EXISTS idx_cities_kind;
         DROP INDEX IF EXISTS idx_cities_osm_kind_unique;
      `);
      await queryInterface.sequelize.query(`
         ALTER TABLE cities
            DROP COLUMN IF EXISTS region_id,
            DROP COLUMN IF EXISTS kind;
      `);
      // Восстанавливаем одиночный unique на osm_id (но только если его нет)
      await queryInterface.sequelize.query(`
         ALTER TABLE cities ADD CONSTRAINT cities_osm_id_key UNIQUE (osm_id);
      `).catch(() => {});
      console.log('✅ Rollback: cities schema reverted');
   },
};
