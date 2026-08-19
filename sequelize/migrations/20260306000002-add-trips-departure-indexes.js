'use strict';


module.exports = {
   up: async (queryInterface) => {
      // 1. Простой индекс на departure_ts (если ещё нет)
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_departure_ts
         ON trips(departure_ts)
      `);

      // 2. Пересоздаём idx_trips_status_departure как partial index
      //    DROP + CREATE безопасны внутри транзакции; IF NOT EXISTS / IF EXISTS — идемпотентно.
      await queryInterface.sequelize.query(`
         DROP INDEX IF EXISTS idx_trips_status_departure
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_status_departure
         ON trips(status, departure_ts)
         WHERE status IN ('CREATED', 'IN_PROGRESS')
      `);
   },

   down: async (queryInterface) => {
      await queryInterface.sequelize.query(`
         DROP INDEX IF EXISTS idx_trips_status_departure
      `);

      // Восстанавливаем полный индекс (состояние до миграции)
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_trips_status_departure
         ON trips(status, departure_ts)
      `);

      await queryInterface.sequelize.query(`
         DROP INDEX IF EXISTS idx_trips_departure_ts
      `);
   },
};
