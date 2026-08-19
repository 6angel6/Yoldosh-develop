'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // PostgreSQL requires a raw query to add a value to an existing ENUM type
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_bookings_status" ADD VALUE IF NOT EXISTS 'REJECTED';`
    );
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing values from an ENUM type without recreating it.
    // Intentionally a no-op.
  }
};
