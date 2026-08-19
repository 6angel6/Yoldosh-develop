'use strict';

/**
 * Денормализуем поля водительского удостоверения из driver_applications в cars.
 * После миграции каждая машина содержит ссылку на фото прав, ПИНФЛ и категорию,
 * что упрощает выдачу в админке и других местах, где нужна полная карточка машины.
 * Поля в driver_applications остаются как источник правды для самой заявки.
 */
module.exports = {
   async up(queryInterface, Sequelize) {
      await queryInterface.addColumn('cars', 'license_front_path', {
         type: Sequelize.STRING,
         allowNull: true,
      });

      await queryInterface.addColumn('cars', 'license_pinfl', {
         type: Sequelize.STRING(14),
         allowNull: true,
      });

      await queryInterface.addColumn('cars', 'type_of_licence', {
         type: Sequelize.STRING(1),
         allowNull: true,
      });

      // Backfill: одна заявка на пользователя → копируем во все его машины.
      await queryInterface.sequelize.query(`
         UPDATE cars
         SET
            license_front_path = da.license_front_path,
            license_pinfl      = da.license_pinfl,
            type_of_licence    = da.type_of_licence
         FROM driver_applications da
         WHERE cars.driver_id = da.user_id;
      `);
   },

   async down(queryInterface, Sequelize) {
      await queryInterface.removeColumn('cars', 'license_front_path');
      await queryInterface.removeColumn('cars', 'license_pinfl');
      await queryInterface.removeColumn('cars', 'type_of_licence');
   },
};
