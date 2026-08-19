'use strict';

module.exports = {
   up: async (queryInterface, Sequelize) => {
      await queryInterface.createTable('user_blocks', {
         id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
         },
         blocker_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
               model: 'users',
               key: 'id',
            },
            onDelete: 'CASCADE',
         },
         blocked_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
               model: 'users',
               key: 'id',
            },
            onDelete: 'CASCADE',
         },
         status: {
            type: Sequelize.ENUM('BLOCKED', 'UNBLOCKED'),
            allowNull: false,
            defaultValue: 'BLOCKED',
         },
         created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
         },
         updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
         },
      });

      // Создаем индексы для оптимизации запросов
      await queryInterface.addIndex('user_blocks', ['blocker_id'], {
         name: 'user_blocks_blocker_id_idx',
      });

      await queryInterface.addIndex('user_blocks', ['blocked_id'], {
         name: 'user_blocks_blocked_id_idx',
      });

      // Уникальный индекс для предотвращения дубликатов блокировок
      await queryInterface.addIndex('user_blocks', ['blocker_id', 'blocked_id'], {
         unique: true,
         name: 'user_blocks_blocker_blocked_unique',
      });
   },

   down: async (queryInterface, Sequelize) => {
      // Удаляем индексы
      await queryInterface.removeIndex('user_blocks', 'user_blocks_blocker_id_idx');
      await queryInterface.removeIndex('user_blocks', 'user_blocks_blocked_id_idx');
      await queryInterface.removeIndex('user_blocks', 'user_blocks_blocker_blocked_unique');

      // Удаляем таблицу
      await queryInterface.dropTable('user_blocks');
      
      // Удаляем ENUM тип
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_blocks_status";');
   },
};
