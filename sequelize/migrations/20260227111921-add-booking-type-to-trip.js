'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('trips', 'booking_type', {
            type: Sequelize.ENUM('INSTANT', 'REQUEST'),
            allowNull: false,
            defaultValue: 'INSTANT',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('trips', 'booking_type');
        await queryInterface.sequelize.query(
            'DROP TYPE IF EXISTS "enum_trips_booking_type";',
        );
    },
};
