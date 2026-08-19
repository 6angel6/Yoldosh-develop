'use strict';

/**
 * Trip Predictor (Этап 1) — прогнозные колонки в trips.
 *
 *   is_predicted          — прогнозный трип (копия регулярного паттерна)
 *   source_trip_id        — реальный трип-источник (self-ref FK)
 *   pattern_id            — ссылка на driver_patterns (FK добавляется в
 *                           миграции create-driver-patterns, после её создания)
 *   prediction_confidence — уверенность 0..1 на момент генерации
 *   predicted_at          — когда сгенерирован
 *
 * Индексы:
 *   idx_trips_predicted_active — прогнозы в общей выдаче/обслуживании
 *   uq_trips_predicted_day     — бэкстоп идемпотентности генерации: не более
 *                                одного активного прогноза на
 *                                (водитель, маршрут, календарный день UZT)
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            ADD COLUMN IF NOT EXISTS is_predicted          BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS source_trip_id        UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS pattern_id            UUID NULL,
            ADD COLUMN IF NOT EXISTS prediction_confidence NUMERIC(4,3) NULL,
            ADD COLUMN IF NOT EXISTS predicted_at          TIMESTAMPTZ NULL;
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_predicted_active
            ON trips (driver_id, from_city_id, to_city_id, departure_ts)
            WHERE is_predicted = TRUE AND deleted_at IS NULL;
      `);

      await queryInterface.sequelize.query(`
         CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_predicted_day
            ON trips (
               driver_id,
               from_city_id,
               to_city_id,
               ((timezone('Asia/Tashkent', departure_ts))::date)
            )
            WHERE is_predicted = TRUE AND deleted_at IS NULL;
      `);

      console.log('✅ Migration completed: trips prediction columns + indexes');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(
         `DROP INDEX IF EXISTS uq_trips_predicted_day;`,
      );
      await queryInterface.sequelize.query(
         `DROP INDEX IF EXISTS idx_trips_predicted_active;`,
      );
      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            DROP COLUMN IF EXISTS predicted_at,
            DROP COLUMN IF EXISTS prediction_confidence,
            DROP COLUMN IF EXISTS pattern_id,
            DROP COLUMN IF EXISTS source_trip_id,
            DROP COLUMN IF EXISTS is_predicted;
      `);

      console.log('✅ Rollback completed: trips prediction columns removed');
   },
};
