'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Promo Codes
        await queryInterface.createTable('promo_codes', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            code: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            discount_percentage: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            type: {
                type: Sequelize.ENUM('SINGLE_USER', 'GLOBAL'),
                allowNull: false,
                defaultValue: 'SINGLE_USER'
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            use_amount: {
                type: Sequelize.INTEGER,
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

        // Referral Codes
        await queryInterface.createTable('referral_codes', {
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
            code: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
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

        // Referrals
        await queryInterface.createTable('referrals', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            referral_code_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'referral_codes',
                    key: 'id'
                },
                onDelete: 'SET NULL'
            },
            referrer_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            referred_user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'COMPLETED', 'CANCELLED'),
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

        // Referral Rewards
        await queryInterface.createTable('referral_rewards', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            rewardAmount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                field: 'rewardAmount'
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
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
        await queryInterface.addIndex('promo_codes', ['user_id'], {
            unique: true,
            where: {
                type: 'SINGLE_USER',
                user_id: { [Sequelize.Op.ne]: null }
            }
        });

        await queryInterface.addIndex('referral_codes', ['code'], {
            unique: true
        });
        await queryInterface.addIndex('referral_codes', ['user_id'], {
            unique: true
        });

        await queryInterface.addIndex('referrals', ['referrer_id']);
        await queryInterface.addIndex('referrals', ['referred_user_id'], {
            unique: true
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('referral_rewards');
        await queryInterface.dropTable('referrals');
        await queryInterface.dropTable('referral_codes');
        await queryInterface.dropTable('promo_codes');
    }
};