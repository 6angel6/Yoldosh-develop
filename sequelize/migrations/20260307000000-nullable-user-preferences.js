'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Снимаем NOT NULL и убираем default — null = предпочтение не задано
    await queryInterface.changeColumn('users', 'talkative', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn('users', 'music_allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn('users', 'pets_allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE users SET talkative = false WHERE talkative IS NULL`,
    );
    await queryInterface.sequelize.query(
      `UPDATE users SET music_allowed = false WHERE music_allowed IS NULL`,
    );
    await queryInterface.sequelize.query(
      `UPDATE users SET pets_allowed = false WHERE pets_allowed IS NULL`,
    );
    await queryInterface.changeColumn('users', 'talkative', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.changeColumn('users', 'music_allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.changeColumn('users', 'pets_allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
};
