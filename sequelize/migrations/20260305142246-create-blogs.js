'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blogs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
        primaryKey: true,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      title: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      subtitle: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      content: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      coverImage: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      views: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      seoTitle: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      seoDescription: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      seoKeywords: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      authorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'admins',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Индексы

    await queryInterface.addIndex('blogs', ['slug'], {
      unique: true,
      name: 'blogs_slug_unique_idx',
    });

    await queryInterface.addIndex('blogs', ['isPublished'], {
      name: 'blogs_is_published_idx',
    });

    await queryInterface.addIndex('blogs', ['createdAt'], {
      name: 'blogs_created_at_idx',
    });

    // GIN индекс для JSONB (поиск по title)
    await queryInterface.sequelize.query(`
      CREATE INDEX blogs_title_gin_idx
      ON blogs
      USING GIN (title);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blogs');
  },
};