'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Chats
    await queryInterface.createTable('chats', {
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
      participant1Id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'participant1Id'
      },
      participant2Id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'participant2Id'
      },
      unread_count_1: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      unread_count_2: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    // Messages
    await queryInterface.createTable('messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      chatId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'chats',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'chatId'
      },
      senderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'senderId'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      media_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isRead'
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

    // Notifications
    await queryInterface.createTable('notifications', {
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
        field: 'userId'
      },
      message: {
        type: Sequelize.STRING,
        allowNull: false
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isRead'
      },
      type: {
        type: Sequelize.ENUM('trips', 'newsAndAgreement', 'promotionAndDiscounts', 'messages', 'general'),
        allowNull: false,
        defaultValue: 'general'
      },
      is_global: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      target_audience: {
        type: Sequelize.ENUM('ALL', 'DRIVERS', 'PASSENGERS'),
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

    // Indexes for Chats
    await queryInterface.addIndex('chats', ['tripId'], {
      name: 'idx_chats_trip'
    });
    await queryInterface.addIndex('chats', ['participant1Id', 'updatedAt'], {
      name: 'idx_chats_participant1'
    });
    await queryInterface.addIndex('chats', ['participant2Id', 'updatedAt'], {
      name: 'idx_chats_participant2'
    });
    await queryInterface.addIndex('chats', ['tripId', 'participant1Id', 'participant2Id'], {
      unique: true,
      name: 'idx_chats_trip_participants_unique'
    });

    // Indexes for Messages
    await queryInterface.addIndex('messages', ['chatId', 'createdAt'], {
      name: 'idx_messages_chat_created'
    });
    await queryInterface.addIndex('messages', ['senderId'], {
      name: 'idx_messages_sender'
    });
    await queryInterface.addIndex('messages', ['chatId', 'isRead'], {
      name: 'idx_messages_unread',
      where: { isRead: false }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('chats');
  }
};