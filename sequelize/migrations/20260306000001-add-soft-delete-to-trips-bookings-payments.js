'use strict';

module.exports = {
   up: async (queryInterface, Sequelize) => {
      await queryInterface.addColumn('trips', 'deleted_at', {
         type: Sequelize.DATE,
         allowNull: true,
         defaultValue: null,
      });

      await queryInterface.addColumn('bookings', 'deleted_at', {
         type: Sequelize.DATE,
         allowNull: true,
         defaultValue: null,
      });

      await queryInterface.addColumn('payments', 'deleted_at', {
         type: Sequelize.DATE,
         allowNull: true,
         defaultValue: null,
      });

      // Индексы для partial scans активных записей (WHERE deleted_at IS NULL)
      await queryInterface.addIndex('trips', ['deleted_at'], {
         name: 'idx_trips_deleted_at',
         where: { deleted_at: null },
      });

      await queryInterface.addIndex('bookings', ['deleted_at'], {
         name: 'idx_bookings_deleted_at',
         where: { deleted_at: null },
      });

      await queryInterface.addIndex('payments', ['deleted_at'], {
         name: 'idx_payments_deleted_at',
         where: { deleted_at: null },
      });
   },

   down: async (queryInterface) => {
      await queryInterface.removeIndex('trips', 'idx_trips_deleted_at');
      await queryInterface.removeIndex('bookings', 'idx_bookings_deleted_at');
      await queryInterface.removeIndex('payments', 'idx_payments_deleted_at');

      await queryInterface.removeColumn('trips', 'deleted_at');
      await queryInterface.removeColumn('bookings', 'deleted_at');
      await queryInterface.removeColumn('payments', 'deleted_at');
   },
};
