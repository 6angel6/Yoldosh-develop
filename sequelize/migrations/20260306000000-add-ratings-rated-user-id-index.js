'use strict';

module.exports = {
   up: async (queryInterface) => {
      await queryInterface.addIndex('ratings', ['rated_user_id'], {
         name: 'idx_ratings_rated_user_id',
         concurrently: true,
      });
   },

   down: async (queryInterface) => {
      await queryInterface.removeIndex('ratings', 'idx_ratings_rated_user_id');
   },
};
