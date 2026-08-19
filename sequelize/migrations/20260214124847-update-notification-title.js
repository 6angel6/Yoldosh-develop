'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('notifications', 'title', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'Уведомление',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('notifications', 'title');
  }
};