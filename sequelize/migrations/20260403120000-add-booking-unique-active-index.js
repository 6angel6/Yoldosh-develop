'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
   async up(queryInterface) {
      // Partial unique index: prevents duplicate active bookings for same passenger on same trip.
      // Only one non-cancelled, non-failed booking allowed per (tripId, passengerId).
      await queryInterface.sequelize.query(`
         CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_unique_active_per_passenger
         ON bookings ("tripId", "passengerId")
         WHERE status NOT IN ('CANCELLED', 'FAILED')
         AND "deleted_at" IS NULL;
      `);
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`
         DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_unique_active_per_passenger;
      `);
   },
};
