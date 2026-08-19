'use strict';

/**
 * Посылки (MVP) — таблица parcels.
 *
 * Максимально просто, как в Яндекс Доставке: о посылке ничего не известно —
 * только точка А (где водитель забирает) и точка Б (куда привезти),
 * прикреплённые к междугороднему трипу с parcels_allowed.
 *
 * Флоу как у брони — по booking_type трипа:
 *   INSTANT → сразу CONFIRMED, REQUEST → PENDING (водитель подтверждает).
 *   CONFIRMED → PICKED_UP (забрал) → DELIVERED (отдал)
 *   ↘ REJECTED (водитель)  ↘ CANCELLED (отправитель / отмена трипа)
 *
 * Места (seats_available) посылка НЕ занимает.
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         DO $$ BEGIN
            CREATE TYPE "enum_parcels_status" AS ENUM (
               'PENDING', 'CONFIRMED', 'REJECTED',
               'CANCELLED', 'PICKED_UP', 'DELIVERED'
            );
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);

      await queryInterface.sequelize.query(`
         CREATE TABLE IF NOT EXISTS parcels (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            sender_id           UUID NOT NULL REFERENCES users(id),

            pickup_latitude     NUMERIC(9,6) NOT NULL,
            pickup_longitude    NUMERIC(9,6) NOT NULL,
            dropoff_latitude    NUMERIC(9,6) NOT NULL,
            dropoff_longitude   NUMERIC(9,6) NOT NULL,

            from_city           VARCHAR(255) NOT NULL DEFAULT '',
            to_city             VARCHAR(255) NOT NULL DEFAULT '',
            from_address        VARCHAR(255) NOT NULL DEFAULT '',
            to_address          VARCHAR(255) NOT NULL DEFAULT '',

            price               NUMERIC(10,2) NOT NULL,
            status              "enum_parcels_status" NOT NULL DEFAULT 'PENDING',
            cancellation_reason VARCHAR(100) NULL,

            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at          TIMESTAMPTZ NULL
         );
      `);

      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_parcels_trip_status
            ON parcels (trip_id, status);
      `);
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_parcels_sender_created
            ON parcels (sender_id, created_at);
      `);

      console.log('✅ Migration completed: parcels table');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS parcels;`);
      await queryInterface.sequelize.query(
         `DROP TYPE IF EXISTS "enum_parcels_status";`,
      );

      console.log('✅ Rollback completed: parcels table removed');
   },
};
