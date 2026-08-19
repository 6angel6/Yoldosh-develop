'use strict';

/**
 * tg_user — Telegram-аккаунт (id/username) водителя, импортированного из
 * бота-парсера. Заполняется только для FromBot-водителей в tripImportService;
 * обычные пользователи из приложения его не имеют, поэтому nullable.
 */
module.exports = {
   up: async (queryInterface, Sequelize) => {
      await queryInterface.addColumn('users', 'tg_user', {
         type: Sequelize.STRING,
         allowNull: true,
      });
   },

   down: async (queryInterface, Sequelize) => {
      await queryInterface.removeColumn('users', 'tg_user');
   },
};
