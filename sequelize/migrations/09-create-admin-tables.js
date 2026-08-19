'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Admins
        await queryInterface.createTable('admins', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            email: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            password: {
                type: Sequelize.STRING,
                allowNull: true
            },
            firstName: {
                type: Sequelize.STRING,
                allowNull: false,
                field: 'firstName'
            },
            lastName: {
                type: Sequelize.STRING,
                allowNull: false,
                field: 'lastName'
            },
            role: {
                type: Sequelize.ENUM('Admin', 'SuperAdmin'),
                allowNull: false,
                defaultValue: 'Admin'
            },
            permissions: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: {
                    driver_applications: true,
                    reports: true,
                    trips: true,
                    notifications: true,
                    promocodes: true,
                    moderation: true
                }
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

        // Admin Logs
        await queryInterface.createTable('admin_logs', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            admin_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'admins',
                    key: 'id'
                }
            },
            action: {
                type: Sequelize.ENUM(
                    'Начал сессию',
                    'Завершил сессию',
                    'Посмотрел заявки водителей',
                    'Изменил статус заявки',
                    'Посмотрел жалобы',
                    'Изменил статус жалобы',
                    'Забанил пользователя',
                    'Создал админа',
                    'Удалил админа',
                    'Обновил права доступа админа',
                    'Изменил поездку',
                    'Удалил поездку',
                    'Создал глобальное уведомление',
                    'Добавил цензурное слово',
                    'Удалил цензурное слово'
                ),
                allowNull: false
            },
            admin_name: {
                type: Sequelize.STRING,
                allowNull: true
            },
            details: {
                type: Sequelize.STRING,
                allowNull: true
            },
            timestamp: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
                allowNull: false
            },
            related_entity_id: {
                type: Sequelize.STRING,
                allowNull: true
            },
            related_entity_type: {
                type: Sequelize.STRING,
                allowNull: true
            },
            is_reverted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            reverted_by: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'admins',
                    key: 'id'
                }
            },
            reverted_at: {
                type: Sequelize.DATE,
                allowNull: true
            }
        });

        // Restricted Words
        await queryInterface.createTable('restricted_words', {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            word: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
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

        // Token Blacklist
        await queryInterface.createTable('token_blacklist', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            token: {
                type: Sequelize.STRING(512),
                allowNull: false,
                unique: true
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('token_blacklist');
        await queryInterface.dropTable('restricted_words');
        await queryInterface.dropTable('admin_logs');
        await queryInterface.dropTable('admins');
    }
};