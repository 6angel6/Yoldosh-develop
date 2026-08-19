import { setupAssociations } from '../shared/models/Associations';
// UserCard не импортируется из Associations, но Payment ссылается на user_cards
// через references. Без регистрации модели db.sync() создаёт payments раньше
// user_cards и падает на несуществующей таблице.
import '../src/payment/models/UserCard';
import logger from '../shared/utils/logger';
import db from '../shared/config/database';
import { afterAll, beforeAll, beforeEach } from 'vitest';

beforeAll(async () => {
   try {
      logger.info('Connecting to the test database...');
      await db.authenticate();
      // Ассоциации до sync: FK-связи должны быть известны при создании таблиц.
      setupAssociations();
      await db.sync({ force: true });

      logger.info('Test database schema synchronized.');
      logger.info('Static test data seeded successfully.');
   } catch (error) {
      logger.error({ err: error }, 'Failed to set up the test database.');
      throw error;
   }
});

beforeEach(async () => {
   const models = Object.values(db.models);
   const tableNames = models
      .map((model) => `"${model.getTableName()}"`)
      .join(', ');
   if (!tableNames) return;

   // main.ts на импорте запускает воркеры BullMQ в этом же процессе: они
   // асинхронно дописывают notifications после ответа HTTP-запроса, и
   // TRUNCATE следующего теста может поймать deadlock (40P01). Ретраим.
   for (let attempt = 1; ; attempt++) {
      try {
         await db.query(
            `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`,
         );
         return;
      } catch (error) {
         const isDeadlock =
            (error as { parent?: { code?: string } })?.parent?.code === '40P01';
         if (!isDeadlock || attempt >= 3) throw error;
         await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
   }
});

afterAll(async () => {
   await db.close();
   logger.info('Test database connection closed.');
});
