'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'rating';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'booking';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'payment';`
    );
  },

  async down() {
    // PostgreSQL does not support removing values from an ENUM without recreating it.
    // Intentionally a no-op.
  },
};
