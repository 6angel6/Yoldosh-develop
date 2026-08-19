'use strict';

/**
 * Добавляет admins.permissions.bookings = true для всех существующих админов,
 * чтобы новый раздел `Bookings` (списки + смена статуса) сразу был доступен
 * без ручной правки каждой записи.
 *
 * Сам ключ — обычный JSONB-флаг, отдельного типа/колонки не нужно.
 * Новые админы получают его дефолтно через DataTypes.JSONB defaultValue
 * в src/admin/auth/models/Admin.ts.
 */
module.exports = {
   async up(queryInterface) {
      const t = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.sequelize.query(
            `UPDATE admins
                SET permissions = jsonb_set(
                   COALESCE(permissions, '{}'::jsonb),
                   '{bookings}',
                   'true'::jsonb,
                   true
                )
              WHERE NOT (permissions ? 'bookings');`,
            { transaction: t },
         );
         await t.commit();
         console.log('✅ admins.permissions.bookings backfilled');
      } catch (err) {
         await t.rollback();
         throw err;
      }
   },

   async down(queryInterface) {
      const t = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.sequelize.query(
            `UPDATE admins
                SET permissions = permissions - 'bookings'
              WHERE permissions ? 'bookings';`,
            { transaction: t },
         );
         await t.commit();
      } catch (err) {
         await t.rollback();
         throw err;
      }
   },
};
