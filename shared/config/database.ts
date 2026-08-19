import dotenv from 'dotenv';
import logger from '../utils/logger';

import { Sequelize } from 'sequelize';

dotenv.config();

const isTestEnv = process.env.NODE_ENV === 'test';
const isDocker = process.env.DOCKER_ENV === 'true';

const DB_NAME = isTestEnv ? process.env.TEST_DB_NAME : process.env.DB_NAME;
const DB_USER = isTestEnv ? process.env.TEST_DB_USER : process.env.DB_USER;
const DB_PASSWORD = isTestEnv
   ? process.env.TEST_DB_PASSWORD
   : process.env.DB_PASSWORD;
const DB_HOST = isTestEnv ? process.env.TEST_DB_HOST : process.env.DB_HOST;
const DB_PORT = isTestEnv ? process.env.TEST_DB_PORT : process.env.DB_PORT;

if (!DB_NAME || !DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT) {
   logger.error(
      { isTestEnv },
      'Missing required database environment variables.',
   );
   throw new Error('Missing database environment variables.');
}

const baseConfig = {
   dialect: 'postgres' as const,
   logging: (sql: string, timing?: number) => {
      if (timing && timing > 500) {
         logger.error(`Critical slow query (${timing}ms): ${sql}`);
      } else if (timing && timing > 100) {
         logger.warn(`Slow query (${timing}ms): ${sql}`);
      }
   },
   pool: {
      max: 50,
      min: 10,
      acquire: 5000,
      idle: 30000,
      evict: 1000,
      validate: () => true,
   },
   benchmark: true,
   retry: {
      max: 3,
      match: [/SequelizeConnectionError/, /SequelizeConnectionRefusedError/],
   },
};

export const db = isDocker
   ? new Sequelize({
        ...baseConfig,
        replication: {
           write: {
              host: 'db',
              port: 5432,
              username: DB_USER!,
              password: DB_PASSWORD!,
              database: DB_NAME!,
           },
           read: [
              {
                 host: 'db-replica',
                 port: 5432,
                 username: DB_USER!,
                 password: DB_PASSWORD!,
                 database: DB_NAME!,
              },
           ],
        },
     })
   : new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
        ...baseConfig,
        host: DB_HOST,
        port: parseInt(DB_PORT!, 10),
     });

// void: fire-and-forget на старте, отказ обработан внутри try/catch
void (async () => {
   try {
      await db.authenticate();
      logger.info('Database connection established');
   } catch (error) {
      logger.error({ err: error }, 'Unable to connect to the database');
   }
})();

export default db;
