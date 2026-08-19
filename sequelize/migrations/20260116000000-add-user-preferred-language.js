'use strict';

module.exports = {
   async up(queryInterface, Sequelize) {
      await queryInterface.addColumn('users', 'preferred_language', {
         type: Sequelize.ENUM('ru', 'uz', 'en'),
         allowNull: false,
         defaultValue: 'ru',
         after: 'preferred_navigator',
      });
   },

   async down(queryInterface, Sequelize) {
      await queryInterface.removeColumn('users', 'preferred_language');
      await queryInterface.sequelize.query(
         'DROP TYPE IF EXISTS "enum_users_preferred_language";',
      );
   },
};
