'use strict';

/**
 * Кросс-транспортная идемпотентность чата (WS ↔ REST).
 *
 * Добавляет messages.client_id — клиентский идемпотентный ключ, который
 * мобильный клиент шлёт в `message.send` (и, опционально, в REST-тело).
 * Частичный UNIQUE-индекс по (chatId, client_id) гарантирует, что повтор
 * с тем же ключом (ретрай/реконнект/дубль на стыке WS и REST) не создаёт
 * вторую строку. Индекс частичный (WHERE client_id IS NOT NULL), поэтому
 * старые сообщения без ключа между собой не конфликтуют.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id VARCHAR(255);
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_chat_client_unique
        ON messages ("chatId", client_id)
        WHERE client_id IS NOT NULL;
    `);

    console.log('✅ Migration completed: messages.client_id + idempotency index');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_messages_chat_client_unique;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE messages DROP COLUMN IF EXISTS client_id;
    `);

    console.log('✅ Rollback completed: removed messages.client_id');
  },
};
