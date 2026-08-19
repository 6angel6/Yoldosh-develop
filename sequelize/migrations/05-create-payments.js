'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Wallets
        await queryInterface.createTable('wallets', {
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
            balance: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0
            },
            currency: {
                type: Sequelize.ENUM('UZS', 'USD', 'RUB'),
                allowNull: false,
                defaultValue: 'UZS'
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

        // Transactions
        await queryInterface.createTable('transactions', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            wallet_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            type: {
                type: Sequelize.ENUM('DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'COMMISSION', 'TRANSFER'),
                allowNull: false
            },
            amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('CREATED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUND'),
                allowNull: false,
                defaultValue: 'CREATED'
            },
            description: {
                type: Sequelize.STRING,
                allowNull: true
            },
            related_entity_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            related_entity_type: {
                type: Sequelize.STRING,
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

        // User Cards
        await queryInterface.createTable('user_cards', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            contract_id: {
                type: Sequelize.STRING,
                allowNull: false
            },
            card_number: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: ''
            },
            expiry: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: ''
            },
            card_type: {
                type: Sequelize.ENUM('NONE', 'HUMO', 'UZCARD'),
                allowNull: false,
                defaultValue: 'NONE'
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

        // Payments
        await queryInterface.createTable('payments', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            transaction_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: 'transactions',
                    key: 'id'
                }
            },
            provider: {
                type: Sequelize.ENUM('OCTO', 'CLICK', 'PAYME', 'PLUM', 'PAYNET', 'IPAK', 'NONE'),
                allowNull: false,
                defaultValue: 'NONE'
            },
            provider_transaction_id: {
                type: Sequelize.STRING,
                allowNull: false
            },
            user_card_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'user_cards',
                    key: 'id'
                }
            },
            status: {
                type: Sequelize.ENUM('SUCCESS', 'PENDING', 'CREATED', 'FAILED', 'REVERSED'),
                allowNull: false,
                defaultValue: 'CREATED'
            },
            amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            raw_response: {
                type: Sequelize.JSONB,
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

        // Fiscal Receipts
        await queryInterface.createTable('fiscal_receipts', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            transactionId: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: 'transactions',
                    key: 'id'
                },
                field: 'transactionId'
            },
            ofd_link: {
                type: Sequelize.STRING,
                allowNull: false
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
        await queryInterface.addIndex('transactions', ['wallet_id', 'status', 'createdAt'], {
            name: 'idx_transactions_wallet_status'
        });
        await queryInterface.addIndex('transactions', ['related_entity_id', 'related_entity_type'], {
            name: 'idx_transactions_related_entity'
        });
        await queryInterface.addIndex('transactions', ['type', 'status'], {
            name: 'idx_transactions_type_status'
        });
        await queryInterface.addIndex('transactions', ['createdAt'], {
            name: 'idx_transactions_created_at'
        });
        await queryInterface.addIndex('transactions', ['status', 'createdAt'], {
            name: 'idx_transactions_pending',
            where: { status: ['PENDING', 'CREATED'] }
        });

        await queryInterface.addIndex('payments', ['transaction_id'], {
            unique: true,
            name: 'idx_payments_transaction_unique'
        });
        await queryInterface.addIndex('payments', ['provider', 'status'], {
            name: 'idx_payments_provider_status'
        });
        await queryInterface.addIndex('payments', ['user_card_id'], {
            name: 'idx_payments_user_card'
        });
        await queryInterface.addIndex('payments', ['provider_transaction_id'], {
            name: 'idx_payments_provider_trans_id'
        });
        await queryInterface.addIndex('payments', ['provider', 'createdAt'], {
            name: 'idx_payments_provider_created'
        });
        await queryInterface.addIndex('payments', ['status'], {
            name: 'idx_payments_status'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('fiscal_receipts');
        await queryInterface.dropTable('payments');
        await queryInterface.dropTable('user_cards');
        await queryInterface.dropTable('transactions');
        await queryInterface.dropTable('wallets');
    }
};