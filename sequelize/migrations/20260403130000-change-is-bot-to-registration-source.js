'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
   async up(queryInterface, Sequelize) {
      // 1. Create enum type
      await queryInterface.sequelize.query(`
         CREATE TYPE "enum_users_registration_source" AS ENUM ('user', 'from_bot', 'reg_bot');
      `);

      // 2. Add new column
      await queryInterface.addColumn('users', 'registration_source', {
         type: Sequelize.ENUM('user', 'from_bot', 'reg_bot'),
         defaultValue: 'user',
         allowNull: false,
      });

      // 3. Migrate data: is_bot=true → 'from_bot', is_bot=false/null → 'user'
      await queryInterface.sequelize.query(`
         UPDATE users SET registration_source = 'from_bot' WHERE is_bot = true;
      `);

      // 4. Drop old column
      await queryInterface.removeColumn('users', 'is_bot');
   },

   async down(queryInterface, Sequelize) {
      // 1. Re-add is_bot column
      await queryInterface.addColumn('users', 'is_bot', {
         type: Sequelize.BOOLEAN,
         allowNull: true,
         defaultValue: false,
      });

      // 2. Migrate data back
      await queryInterface.sequelize.query(`
         UPDATE users SET is_bot = true WHERE registration_source IN ('from_bot', 'reg_bot');
      `);

      // 3. Drop new column
      await queryInterface.removeColumn('users', 'registration_source');

      // 4. Drop enum type
      await queryInterface.sequelize.query(`
         DROP TYPE IF EXISTS "enum_users_registration_source";
      `);
   },
};
