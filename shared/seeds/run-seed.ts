import { seedAdmins } from './adminSeed';
import { DriverTestAccount } from './testDriver';
import db from '../config/database';
import logger from '../utils/logger';

const run = async () => {
   try {
      await db.authenticate();
      logger.info('Database connection established.');
      await seedAdmins();
      await DriverTestAccount();
      logger.info('Seeding process completed.');
      process.exit(0);
   } catch (error) {
      logger.error(error, 'Seeding process failed.');
      process.exit(1);
   }
};

void run();
