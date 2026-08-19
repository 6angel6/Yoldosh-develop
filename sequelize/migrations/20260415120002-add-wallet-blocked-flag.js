'use strict';

/**
 * Денормализованный флаг users.is_wallet_blocked — чтобы поисковый SQL
 * не джойнил wallets на каждом запросе. Флаг поддерживается триггером.
 *
 * Правило блокировки: balance < 0 (строго отрицательный). Порог можно
 * поднять позднее, подправив функцию fn_sync_user_wallet_blocked.
 */
module.exports = {
   async up(queryInterface) {
      await queryInterface.sequelize.query(`
         ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_wallet_blocked boolean NOT NULL DEFAULT false;
      `);

      // Триггер-функция: синхронизация флага на users при изменении balance
      await queryInterface.sequelize.query(`
         CREATE OR REPLACE FUNCTION fn_sync_user_wallet_blocked()
         RETURNS TRIGGER AS $$
         BEGIN
            UPDATE users
               SET is_wallet_blocked = (NEW.balance < 0)
             WHERE id = NEW.user_id
               AND is_wallet_blocked IS DISTINCT FROM (NEW.balance < 0);
            RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;
      `);

      await queryInterface.sequelize.query(`
         DROP TRIGGER IF EXISTS trigger_sync_user_wallet_blocked ON wallets;
         CREATE TRIGGER trigger_sync_user_wallet_blocked
            AFTER INSERT OR UPDATE OF balance ON wallets
            FOR EACH ROW
            EXECUTE FUNCTION fn_sync_user_wallet_blocked();
      `);

      // Initial backfill из текущих балансов
      await queryInterface.sequelize.query(`
         UPDATE users u
            SET is_wallet_blocked = (w.balance < 0)
           FROM wallets w
          WHERE w.user_id = u.id
            AND u.is_wallet_blocked IS DISTINCT FROM (w.balance < 0);
      `);

      // Partial index — hotpath для поиска: отфильтровать «хороших» водителей
      await queryInterface.sequelize.query(`
         CREATE INDEX IF NOT EXISTS idx_users_good_drivers
            ON users (id)
            WHERE is_wallet_blocked = false AND is_banned = false;
      `);

      console.log('✅ Migration completed: users.is_wallet_blocked + trigger');
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_users_good_drivers;`);
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trigger_sync_user_wallet_blocked ON wallets;`);
      await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS fn_sync_user_wallet_blocked();`);
      await queryInterface.sequelize.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_wallet_blocked;`);
      console.log('✅ Rollback completed: is_wallet_blocked removed');
   },
};
