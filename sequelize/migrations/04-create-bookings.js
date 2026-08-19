'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      tripId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'trips',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'tripId'
      },
      passengerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'passengerId'
      },
      pickup_latitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: false,
        defaultValue: 0.0
      },
      from_longitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: false,
        defaultValue: 0.0
      },
      dropoff_latitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: false,
        defaultValue: 0.0
      },
      dropoff_longitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: false,
        defaultValue: 0.0
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
      from_address: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ''
      },
      to_address: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ''
      },
      seatsBooked: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: 'seatsBooked'
      },
      totalPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        field: 'totalPrice'
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'),
        allowNull: false
      },
      cancellationReason: {
        type: Sequelize.STRING(100),
        allowNull: true,
        field: 'cancellationReason'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Indexes
    await queryInterface.addIndex('bookings', ['tripId', 'status'], {
      name: 'idx_bookings_trip_status'
    });
    await queryInterface.addIndex('bookings', ['passengerId', 'createdAt'], {
      name: 'idx_bookings_passenger'
    });
    await queryInterface.addIndex('bookings', ['tripId', 'status'], {
      name: 'idx_bookings_trip_active',
      where: { status: 'CONFIRMED' }
    });
    await queryInterface.addIndex('bookings', ['status'], {
      name: 'idx_bookings_status'
    });
    await queryInterface.addIndex('bookings', ['tripId', 'passengerId'], {
      name: 'idx_bookings_trip_passenger'
    });
    await queryInterface.addIndex('bookings', ['createdAt'], {
      name: 'idx_bookings_created_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('bookings');
  }
};