    require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'yoldosh_dev',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeSeeds',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME_TEST || 'yoldosh_test',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeSeeds',
    logging: false,
    pool: {
      max: 3,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeSeeds',
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 60000,
      idle: 20000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
};