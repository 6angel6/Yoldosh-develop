'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
   async up(queryInterface, Sequelize) {
      await queryInterface.createTable('banners', {
         id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
         },
         type: {
            type: Sequelize.ENUM('popup', 'inline_banner', 'carousel', 'fullscreen'),
            allowNull: false,
         },
         placement: { type: Sequelize.STRING, allowNull: false },
         title: { type: Sequelize.JSONB, allowNull: true },
         body: { type: Sequelize.JSONB, allowNull: true },
         media: { type: Sequelize.JSONB, allowNull: true },
         action_url: { type: Sequelize.STRING, allowNull: true },
         priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
         start_at: { type: Sequelize.DATE, allowNull: true },
         end_at: { type: Sequelize.DATE, allowNull: true },
         is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
         },
         // Зарезервировано под фазу 2 (таргетинг/капинг).
         targeting: { type: Sequelize.JSONB, allowNull: true },
         frequency: { type: Sequelize.JSONB, allowNull: true },
         author_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'admins', key: 'id' },
            onDelete: 'SET NULL',
         },
         created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('now()'),
         },
         updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('now()'),
         },
      });

      await queryInterface.addIndex('banners', ['placement', 'is_active'], {
         name: 'idx_banners_placement_active',
      });
      await queryInterface.addIndex('banners', ['priority'], {
         name: 'idx_banners_priority',
      });
   },

   async down(queryInterface) {
      await queryInterface.dropTable('banners');
      await queryInterface.sequelize.query(
         'DROP TYPE IF EXISTS "enum_banners_type";',
      );
   },
};
