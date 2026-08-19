'use strict';

/**
 * Расширяет admin_logs:
 *   + category (ENUM)         — семантическая категория действия
 *   + entity_snapshot (JSONB) — кеш представления сущности (label/subLabel/meta)
 *   + metadata (JSONB)        — произвольные данные действия (before/after, query, и т.д.)
 *   + ip_address, user_agent  — кто / откуда выполнил действие
 *   + session_id (UUID)       — связывает LOGIN/LOGOUT в один таймлайн сессии
 *   + индексы для быстрых выборок логов в админ-панели
 *
 * Дополнительно:
 *   - расширяет ENUM enum_admin_logs_action новыми значениями
 *   - меняет details на TEXT (больше места под расширенные сообщения)
 *   - добавляет всем существующим админам permission USERS=true и BLOGS=true (если ещё нет)
 */
module.exports = {
   async up(queryInterface, Sequelize) {
      const t = await queryInterface.sequelize.transaction();
      try {
         // 1. Новые значения action ENUM
         const newActions = [
            'Разбанил пользователя',
            'Открыл профиль пользователя',
            'Искал пользователей',
            'Изменил статус поездки',
            'Изменил статус брони',
            'Создал промокод',
            'Удалил промокод',
         ];
         for (const value of newActions) {
            await queryInterface.sequelize.query(
               `ALTER TYPE "enum_admin_logs_action" ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}';`,
               { transaction: t },
            );
         }

         // 2. Создаём ENUM категории
         await queryInterface.sequelize.query(
            `DO $$ BEGIN
               CREATE TYPE "enum_admin_logs_category" AS ENUM (
                  'SESSION', 'USERS', 'TRIPS', 'REPORTS', 'APPLICATIONS',
                  'ADMINS', 'NOTIFICATIONS', 'MODERATION', 'BLOG',
                  'PROMOCODES', 'OTHER'
               );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
            { transaction: t },
         );

         // 3. Добавляем новые столбцы в admin_logs
         await queryInterface.sequelize.query(
            `ALTER TABLE admin_logs
               ADD COLUMN IF NOT EXISTS category "enum_admin_logs_category" NOT NULL DEFAULT 'OTHER',
               ADD COLUMN IF NOT EXISTS entity_snapshot JSONB,
               ADD COLUMN IF NOT EXISTS metadata JSONB,
               ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
               ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512),
               ADD COLUMN IF NOT EXISTS session_id UUID;`,
            { transaction: t },
         );

         // 4. Расширяем details до TEXT (если ранее VARCHAR)
         await queryInterface.sequelize.query(
            `ALTER TABLE admin_logs ALTER COLUMN details TYPE TEXT;`,
            { transaction: t },
         );

         // 5. Backfill категории для уже записанных action-ов
         const backfill = [
            ['SESSION', ['Начал сессию', 'Завершил сессию']],
            ['APPLICATIONS', ['Посмотрел заявки водителей', 'Изменил статус заявки']],
            ['REPORTS', ['Посмотрел жалобы', 'Изменил статус жалобы']],
            ['USERS', ['Забанил пользователя']],
            ['ADMINS', ['Создал админа', 'Удалил админа', 'Обновил права доступа админа']],
            ['TRIPS', ['Изменил поездку', 'Удалил поездку']],
            ['NOTIFICATIONS', ['Создал глобальное уведомление']],
            ['MODERATION', ['Добавил цензурное слово', 'Удалил цензурное слово']],
            ['BLOG', ['Создал статью в блоге', 'Обновил статью в блоге', 'Удалил статью из блога']],
         ];
         for (const [cat, actions] of backfill) {
            const inList = actions.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
            await queryInterface.sequelize.query(
               `UPDATE admin_logs SET category = '${cat}' WHERE category = 'OTHER' AND action::text IN (${inList});`,
               { transaction: t },
            );
         }

         // 6. Индексы
         await queryInterface.sequelize.query(
            `CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_timestamp
                ON admin_logs (admin_id, timestamp DESC);`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `CREATE INDEX IF NOT EXISTS idx_admin_logs_category
                ON admin_logs (category);`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `CREATE INDEX IF NOT EXISTS idx_admin_logs_entity
                ON admin_logs (related_entity_type, related_entity_id);`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `CREATE INDEX IF NOT EXISTS idx_admin_logs_session
                ON admin_logs (session_id);`,
            { transaction: t },
         );

         // 7. Backfill permissions: всем существующим админам выдаём USERS и BLOGS = true
         //    (если ключа ещё нет в JSONB)
         await queryInterface.sequelize.query(
            `UPDATE admins
                SET permissions = jsonb_set(
                   COALESCE(permissions, '{}'::jsonb),
                   '{users}',
                   'true'::jsonb,
                   true
                )
              WHERE NOT (permissions ? 'users');`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `UPDATE admins
                SET permissions = jsonb_set(
                   COALESCE(permissions, '{}'::jsonb),
                   '{blogs}',
                   'true'::jsonb,
                   true
                )
              WHERE NOT (permissions ? 'blogs');`,
            { transaction: t },
         );

         await t.commit();
         console.log('✅ admin_logs extended; permissions backfilled');
      } catch (err) {
         await t.rollback();
         throw err;
      }
   },

   async down(queryInterface, Sequelize) {
      const t = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.sequelize.query(
            `DROP INDEX IF EXISTS idx_admin_logs_admin_timestamp;`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `DROP INDEX IF EXISTS idx_admin_logs_category;`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `DROP INDEX IF EXISTS idx_admin_logs_entity;`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `DROP INDEX IF EXISTS idx_admin_logs_session;`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `ALTER TABLE admin_logs
                DROP COLUMN IF EXISTS category,
                DROP COLUMN IF EXISTS entity_snapshot,
                DROP COLUMN IF EXISTS metadata,
                DROP COLUMN IF EXISTS ip_address,
                DROP COLUMN IF EXISTS user_agent,
                DROP COLUMN IF EXISTS session_id;`,
            { transaction: t },
         );
         await queryInterface.sequelize.query(
            `DROP TYPE IF EXISTS "enum_admin_logs_category";`,
            { transaction: t },
         );
         console.log('Внимание: новые значения enum_admin_logs_action не откатываются (PG ограничение).');
         await t.commit();
      } catch (err) {
         await t.rollback();
         throw err;
      }
   },
};
