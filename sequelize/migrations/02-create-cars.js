'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Driver Applications
        await queryInterface.createTable('driver_applications', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            first_name: {
                type: Sequelize.STRING(32),
                allowNull: true
            },
            last_name: {
                type: Sequelize.STRING(32),
                allowNull: true
            },
            middle_name: {
                type: Sequelize.STRING(32),
                allowNull: true
            },
            phone: {
                type: Sequelize.STRING(13),
                allowNull: false,
                unique: true
            },
            license_front_path: {
                type: Sequelize.STRING,
                allowNull: false
            },
            license_pinfl: {
                type: Sequelize.STRING(14),
                allowNull: false
            },
            type_of_licence: {
                type: Sequelize.STRING(1),
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'VERIFIED', 'REJECTED', 'FAILED_DIDOX'),
                allowNull: false,
                defaultValue: 'PENDING'
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

        // Cars
        await queryInterface.createTable('cars', {
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
                },
                onDelete: 'CASCADE'
            },
            tech_passport_front_path: {
                type: Sequelize.STRING,
                allowNull: false
            },
            tech_passport_back_path: {
                type: Sequelize.STRING,
                allowNull: false
            },
            gov_number: {
                type: Sequelize.STRING(15),
                allowNull: true
            },
            make: {
                type: Sequelize.STRING,
                allowNull: true
            },
            model: {
                type: Sequelize.STRING,
                allowNull: true
            },
            color: {
                type: Sequelize.STRING,
                allowNull: true
            },
            tech_passport_serial: {
                type: Sequelize.STRING(10),
                allowNull: true
            },
            issue_date: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            seats: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('WAITING_FOR_DIDOX', 'PENDING', 'VERIFIED', 'REJECTED'),
                allowNull: false,
                defaultValue: 'PENDING'
            },
            rejection_reason: {
                type: Sequelize.TEXT,
                allowNull: true
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
        await queryInterface.addIndex('cars', ['driver_id', 'gov_number'], {
            unique: true
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('cars');
        await queryInterface.dropTable('driver_applications');
    }
};