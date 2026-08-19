'use strict';

/**
 * VoIP-токен и платформа храним прямо в users, рядом с fcm_token (одно
 * устройство на юзера — как уже устроен fcm_token). Отдельная таблица устройств
 * не нужна. См. audit/notify/VOIP_IOS_ARCHITECTURE.md.
 */
module.exports = {
   up: async (queryInterface, Sequelize) => {
      // APNs PushKit VoIP-токен — только iOS (нужен для CallKit-звонка).
      await queryInterface.addColumn('users', 'voip_token', {
         type: Sequelize.TEXT,
         allowNull: true,
      });
      // Платформа устройства — чтобы явно различать iOS/Android при пуше.
      await queryInterface.addColumn('users', 'platform', {
         type: Sequelize.ENUM('ios', 'android'),
         allowNull: true,
      });
   },

   down: async (queryInterface, Sequelize) => {
      await queryInterface.removeColumn('users', 'platform');
      await queryInterface.removeColumn('users', 'voip_token');
      await queryInterface.sequelize.query(
         'DROP TYPE IF EXISTS "enum_users_platform";',
      );
   },
};
