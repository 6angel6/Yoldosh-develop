'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
      await queryInterface.addColumn('users', 'is_bot', {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          defaultValue: false,
      });
  },

  async down (queryInterface, Sequelize) {
      await queryInterface.removeColumn('users', 'is_bot');
  }
};
