'use strict';

/**
 * Trip Predictor (Этап 1) — таблица паттернов регулярных водителей.
 *
 * Паттерн — устойчивый повторяющийся трип водителя (маршрут + время выезда).
 * departure_time / recent_departure_min — минуты от полуночи UZT (0..1439).
 * window_occurrences решает активацию (окно MIN_OCCURRENCES/WINDOW_DAYS),
 * occurrences — lifetime-счётчик для метрик.
 *
 * После создания таблицы досоздаём FK trips.pattern_id → driver_patterns.id
 * (колонка pattern_id заведена в предыдущей миграции).
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         CREATE TABLE IF NOT EXISTS driver_patterns (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            driver_id             UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
            from_city_id          UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
            to_city_id            UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
            departure_time        SMALLINT NOT NULL,
            time_tolerance        SMALLINT NOT NULL DEFAULT 30,
            recent_departure_min  SMALLINT[] NOT NULL DEFAULT '{}',
            price                 INTEGER NULL,
            seats                 SMALLINT NULL,
            car_id                UUID NULL REFERENCES cars(id) ON DELETE SET NULL,
            comment               TEXT NULL,
            days_of_week          SMALLINT[] NULL,
            occurrences           INTEGER NOT NULL DEFAULT 1,
            window_occurrences    SMALLINT NOT NULL DEFAULT 1,
            first_seen            DATE NOT NULL,
            last_seen             DATE NOT NULL,
            confidence            NUMERIC(4,3) NOT NULL DEFAULT 0,
            status                TEXT NOT NULL DEFAULT 'candidate',
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_driver_patterns_status
               CHECK (status IN ('candidate', 'active', 'decaying', 'inactive')),
            -- Один паттерн на маршрут водителя: время выезда НЕ входит в ключ
            -- (регулярность определяется по маршруту, время опционально).
            CONSTRAINT uq_driver_patterns_route
               UNIQUE (driver_id, from_city_id, to_city_id)
         );
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_patterns_driver
            ON driver_patterns (driver_id);
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_patterns_active
            ON driver_patterns (status) WHERE status = 'active';
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_patterns_route
            ON driver_patterns (from_city_id, to_city_id);
      `);

      // FK trips.pattern_id → driver_patterns.id (идемпотентно)
      await queryInterface.sequelize.query(`
         DO $$
         BEGIN
            IF NOT EXISTS (
               SELECT 1 FROM pg_constraint WHERE conname = 'fk_trips_pattern'
            ) THEN
               ALTER TABLE trips
                  ADD CONSTRAINT fk_trips_pattern
                  FOREIGN KEY (pattern_id)
                  REFERENCES driver_patterns(id) ON DELETE SET NULL;
            END IF;
         END $$;
      `);

      console.log('✅ Migration completed: driver_patterns + trips.pattern_id FK');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`
         ALTER TABLE trips DROP CONSTRAINT IF EXISTS fk_trips_pattern;
      `);
      await queryInterface.sequelize.query(
         `DROP TABLE IF EXISTS driver_patterns;`,
      );

      console.log('✅ Rollback completed: driver_patterns dropped');
   },
};
