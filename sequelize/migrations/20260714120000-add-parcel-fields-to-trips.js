'use strict';

/**
 * Посылки (MVP) — поля в trips.
 *
 *   parcels_allowed — водитель включил перевозку посылок для этого трипа
 *                     (тумблер при создании/редактировании трипа)
 *   parcel_price    — цена доставки одной посылки; NULL → берём
 *                     price_per_person трипа (fallback в parcelService)
 *
 * Отдельный индекс не нужен: parcels_allowed — низкоселективный AND-фильтр
 * поверх существующих индексов поиска (status/departure_ts/geo).
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            ADD COLUMN IF NOT EXISTS parcels_allowed BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS parcel_price    NUMERIC(10,2) NULL;
      `);

      console.log('✅ Migration completed: trips parcel fields');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`
         ALTER TABLE trips
            DROP COLUMN IF EXISTS parcel_price,
            DROP COLUMN IF EXISTS parcels_allowed;
      `);

      console.log('✅ Rollback completed: trips parcel fields removed');
   },
};
