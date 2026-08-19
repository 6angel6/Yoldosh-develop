'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS from_geo geography(Point, 4326);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS to_geo geography(Point, 4326);
    `);

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

    // 3. Создаем триггер
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trigger_fill_trip_geo ON trips;
      CREATE TRIGGER trigger_fill_trip_geo
        BEFORE INSERT OR UPDATE ON trips
        FOR EACH ROW
        EXECUTE FUNCTION fill_trip_geo_fields();
    `);

    // 4. Создаем GIST индексы для geography полей
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_trips_from_geo ON trips USING GIST (from_geo);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_trips_to_geo ON trips USING GIST (to_geo);
    `);

    // 5. Обновляем существующие записи чтобы заполнить geo поля
    await queryInterface.sequelize.query(`
      UPDATE trips 
      SET updated_at = updated_at 
      WHERE (from_geo IS NULL OR to_geo IS NULL)
      AND from_latitude IS NOT NULL 
      AND from_longitude IS NOT NULL
      AND to_latitude IS NOT NULL
      AND to_longitude IS NOT NULL;
    `);

    console.log('✅ Migration completed: Added geo fields and trigger for trips');
  },

  async down(queryInterface, Sequelize) {
    // Удаляем триггер и функцию
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trigger_fill_trip_geo ON trips;
    `);

    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS fill_trip_geo_fields();
    `);

    // Удаляем индексы
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_trips_from_geo;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_trips_to_geo;
    `);

    // Удаляем колонки
    await queryInterface.removeColumn('trips', 'from_geo');
    await queryInterface.removeColumn('trips', 'to_geo');

    console.log('✅ Rollback completed: Removed geo fields');
  }
};
