'use strict';

/**
 * Trip Predictor (Этап 1) — журнал прогнозов для метрик качества (precision).
 *
 * Одна строка на каждый созданный прогнозный трип.
 *   outcome: pending → confirmed (reconcile) | expired (cron) | cancelled ([Этап 2] decay)
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         CREATE TABLE IF NOT EXISTS prediction_log (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pattern_id      UUID NOT NULL REFERENCES driver_patterns(id) ON DELETE CASCADE,
            predicted_trip  UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            target_date     DATE NOT NULL,
            outcome         TEXT NOT NULL DEFAULT 'pending',
            confirmed_trip  UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at     TIMESTAMPTZ NULL,
            CONSTRAINT chk_prediction_log_outcome
               CHECK (outcome IN ('pending', 'confirmed', 'expired', 'cancelled'))
         );
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_predlog_pattern
            ON prediction_log (pattern_id);
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_predlog_pending
            ON prediction_log (outcome) WHERE outcome = 'pending';
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_predlog_predicted_trip
            ON prediction_log (predicted_trip);
      `);

      console.log('✅ Migration completed: prediction_log');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(
         `DROP TABLE IF EXISTS prediction_log;`,
      );

      console.log('✅ Rollback completed: prediction_log dropped');
   },
};
