'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('users', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            firstName: {
                type: Sequelize.STRING(32),
                allowNull: false,
                field: 'firstName'
            },
            lastName: {
                type: Sequelize.STRING(32),
                allowNull: true,
                field: 'lastName'
            },
            phoneNumber: {
                type: Sequelize.STRING(13),
                allowNull: true,
                unique: true,
                field: 'phoneNumber'
            },
            avatar: {
                type: Sequelize.STRING,
                allowNull: true
            },
            bio: {
                type: Sequelize.STRING(128),
                allowNull: true
            },
            date_of__birthday: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            gender: {
                type: Sequelize.ENUM('MALE', 'FEMALE', 'OTHER'),
                allowNull: true
            },
            talkative: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            smoking_allowed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            pets_allowed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            music_allowed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            conditioner: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            rating: {
                type: Sequelize.FLOAT,
                allowNull: true,
                defaultValue: 5.0
            },
            role: {
                type: Sequelize.ENUM('Passenger', 'Driver'),
                allowNull: false,
                defaultValue: 'Passenger'
            },
            verified: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                allowNull: false
            },
            passport_verified: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                allowNull: false
            },
            otp: {
                type: Sequelize.STRING,
                allowNull: true
            },
            otpExpires: {
                type: Sequelize.DATE,
                allowNull: true,
                field: 'otpExpires'
            },
            preferred_navigator: {
                type: Sequelize.ENUM('YANDEX_NAVI', 'GOOGLE_MAPS', 'NONE'),
                allowNull: false,
                defaultValue: 'YANDEX_NAVI'
            },
            notificationPreferences: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: {
                    trips: true,
                    newsAndAgreement: true,
                    promotionAndDiscounts: true,
                    messages: true,
                    general: true
                },
                field: 'notificationPreferences'
            },
            is_banned: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            fcm_token: {
                type: Sequelize.STRING,
                allowNull: true
            },
            is_have_promocode: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            ban_expires_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            ban_reason: {
                type: Sequelize.STRING(128),
                allowNull: true
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                field: 'createdAt'
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                field: 'updatedAt'
            },
            deletedAt: {
                type: Sequelize.DATE,
                allowNull: true,
                field: 'deletedAt'
            }
        });

        // Indexes
        await queryInterface.addIndex('users', ['phoneNumber'], {
            unique: true,
            name: 'idx_users_phone_unique'
        });
        await queryInterface.addIndex('users', ['role'], {
            name: 'idx_users_role'
        });
        await queryInterface.addIndex('users', ['is_banned', 'ban_expires_at'], {
            name: 'idx_users_banned',
            where: { is_banned: true }
        });
        await queryInterface.addIndex('users', ['role', 'verified', 'passport_verified'], {
            name: 'idx_users_role_verified'
        });
        await queryInterface.addIndex('users', ['createdAt'], {
            name: 'idx_users_created_at'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('users');
    }
};