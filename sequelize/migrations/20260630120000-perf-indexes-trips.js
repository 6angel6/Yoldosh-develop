'use strict';

/** @type {import('sequelize-cli').Migration}
 *
 * Перф-индексы по итогам аудита slow-query (trips). Контракт API не меняется —
 * индексы влияют только на план выполнения, не на результат запросов.
 *
 * Все индексы создаются CONCURRENTLY (без локов таблицы) — миграции в этом проекте
 * выполняются ВНЕ транзакции (см. 20260403120000-add-booking-unique-active-index.js),
 * поэтому CONCURRENTLY допустим. Каждый CREATE — отдельный statement.
 *
 * НЕ добавляем (уже существуют в БД, дубликаты вредны):
 *   - idx_trips_driver_id, idx_trips_car_id            — есть (покрывают JOIN при выборке строк)
 *   - idx_bookings_trip_status / _active / _passenger  — есть, все с "tripId" первой колонкой
 */
module.exports = {
   async up(queryInterface) {
      // §1/§2: точный индекс под ленту активных поездок —
      // WHERE status='CREATED' AND deleted_at IS NULL ORDER BY created_at DESC.
      // Существующий idx_trips_status_departure (status, departure_ts) и отдельный
      // idx_trips_created_at этот паттерн не закрывают: нужен (status, created_at) под
      // фильтр+сортировку одним index(-only) scan'ом. Обслуживает count(*) §1 и
      // deferred-OFFSET §2 (SELECT id ... ORDER BY created_at DESC).
      await queryInterface.sequelize.query(`
         CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_status_created
         ON trips (status, created_at DESC)
         WHERE deleted_at IS NULL;
      `);

      // §3: trigram под LIKE '%city%' в поиске/прайсинге.
      // Выражение ОБЯЗАНО совпадать символ-в-символ с WHERE в коде
      // (tripRepository.ts: LOWER(REGEXP_REPLACE("Trip"."from_city", '[''ʻʼ`´]', '', 'g'))),
      // иначе планировщик индекс не подхватит. pg_trgm уже установлен.
      await queryInterface.sequelize.query(`
         CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_from_city_trgm
         ON trips USING gin (LOWER(REGEXP_REPLACE(from_city, '[''ʻʼ\`´]', '', 'g')) gin_trgm_ops)
         WHERE deleted_at IS NULL;
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_to_city_trgm
         ON trips USING gin (LOWER(REGEXP_REPLACE(to_city, '[''ʻʼ\`´]', '', 'g')) gin_trgm_ops)
         WHERE deleted_at IS NULL;
      `);

      // Обновляем статистику планировщика по новым индексам.
      await queryInterface.sequelize.query(`ANALYZE trips;`);
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_trips_to_city_trgm;`);
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_trips_from_city_trgm;`);
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_trips_status_created;`);
   },
};
