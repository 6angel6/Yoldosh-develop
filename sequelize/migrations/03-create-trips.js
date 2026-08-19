'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('trips', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            driver_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            car_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'cars',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            from_city: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: ''
            },
            to_city: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: ''
            },
            from_latitude: {
                type: Sequelize.DECIMAL(9, 6),
                allowNull: false
            },
            from_longitude: {
                type: Sequelize.DECIMAL(9, 6),
                allowNull: false
            },
            to_latitude: {
                type: Sequelize.DECIMAL(9, 6),
                allowNull: false
            },
            to_longitude: {
                type: Sequelize.DECIMAL(9, 6),
                allowNull: false
            },
            distance: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            duration: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            from_address: {
                type: Sequelize.STRING,
                allowNull: false
            },
            to_address: {
                type: Sequelize.STRING,
                allowNull: false
            },
            departure_ts: {
                type: Sequelize.DATE,
                allowNull: false
            },
            seats_available: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            price_per_person: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            max_two_back: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            conditioner: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            smoking_allowed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            door_pickup: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            food_stop: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            garage: {
                type: Sequelize.ENUM('FULL', 'EMPTY', 'HALF_EMPTY'),
                allowNull: false,
                defaultValue: 'EMPTY'
            },
            comment: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'),
                allowNull: false,
                defaultValue: 'CREATED'
            },
            trip_start_ts: {
                type: Sequelize.DATE,
                allowNull: true
            },
            trip_end_ts: {
                type: Sequelize.DATE,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });

        // Indexes
        await queryInterface.addIndex('trips', ['driver_id'], {
            name: 'idx_trips_driver_id'
        });
        await queryInterface.addIndex('trips', ['departure_ts'], {
            name: 'idx_trips_departure_ts'
        });
        await queryInterface.addIndex('trips', ['car_id'], {
            name: 'idx_trips_car_id'
        });
        await queryInterface.addIndex('trips', ['status', 'departure_ts'], {
            name: 'idx_trips_status_departure'
        });
        await queryInterface.addIndex('trips', ['from_city', 'to_city', 'departure_ts'], {
            name: 'idx_trips_cities_departure'
        });
        await queryInterface.addIndex('trips', ['status', 'driver_id', 'departure_ts'], {
            name: 'idx_trips_active',
            where: { status: ['CREATED', 'IN_PROGRESS'] }
        });
        await queryInterface.addIndex('trips', ['driver_id', 'status'], {
            name: 'idx_trips_driver_status'
        });
        await queryInterface.addIndex('trips', ['car_id', 'status'], {
            name: 'idx_trips_car_active',
            where: { status: ['CREATED', 'IN_PROGRESS'] }
        });
        await queryInterface.addIndex('trips', ['created_at'], {
            name: 'idx_trips_created_at'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('trips');
    }
};