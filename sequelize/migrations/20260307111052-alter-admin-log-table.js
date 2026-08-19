'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_admin_logs_action" ADD VALUE IF NOT EXISTS 'Создал статью в блоге';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_admin_logs_action" ADD VALUE IF NOT EXISTS 'Обновил статью в блоге';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_admin_logs_action" ADD VALUE IF NOT EXISTS 'Удалил статью из блога';`
    );
  },

  async down(queryInterface, Sequelize) {
    console.log('Внимание: Откат ENUM значений в PostgreSQL не поддерживается по умолчанию.');
  }
};
