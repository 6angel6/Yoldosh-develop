'use strict';

module.exports = {
   async up(queryInterface) {
      await queryInterface.removeConstraint(
         'driver_applications',
         'driver_applications_phone_key',
      );
   },

   async down(queryInterface) {
      await queryInterface.addConstraint('driver_applications', {
         fields: ['phone'],
         type: 'unique',
         name: 'driver_applications_phone_key',
      });
   },
};
