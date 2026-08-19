
'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Ratings
        await queryInterface.createTable('ratings', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            trip_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'trips',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            rating_by_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            rated_user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            rating: {
                type: Sequelize.DECIMAL(2, 1),
                allowNull: false
            },
            feedback: {
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

        // Reports
        await queryInterface.createTable('reports', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            userId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                field: 'userId'
            },
            reportedUserId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                field: 'reportedUserId'
            },
            tripId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'trips',
                    key: 'id'
                },
                field: 'tripId'
            },
            reason: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'RESOLVED', 'REJECTED'),
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

        // Searches
        await queryInterface.createTable('searches', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            userId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                field: 'userId'
            },
            guest_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            from_city: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            to_city: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            from_address: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            to_address: {
                type: Sequelize.STRING(255),
                allowNull: false
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
        await queryInterface.addIndex('ratings', ['trip_id', 'rating_by_id', 'rated_user_id'], {
            unique: true,
            name: 'unique_rating_constraint'
        });

        await queryInterface.addIndex('reports', ['userId'], {
            name: 'idx_reports_user'
        });
        await queryInterface.addIndex('reports', ['reportedUserId'], {
            name: 'idx_reports_reported_user'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('searches');
        await queryInterface.dropTable('reports');
        await queryInterface.dropTable('ratings');
    }
};