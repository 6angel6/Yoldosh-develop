import User, { UserRole } from '../../../user/models/User';
import Wallet from '../../../payment/models/Wallet';
import { Op } from 'sequelize';
import { publishWalletNotification } from '../../queues/notificationQueue';
import logger from '../../../../shared/utils/logger';
import { redisClient } from '../../../../shared/config/redis';

const BATCH_SIZE = 50;

export const sendNegativeBalanceReminders = async (): Promise<void> => {
   logger.info('Starting negative balance reminders');

   const driversWithNegativeBalance = await User.findAll({
      where: {
         role: UserRole.Driver,
         verified: true,
         isBanned: false,
      },
      include: [
         {
            model: Wallet,
            as: 'wallet',
            where: {
               balance: {
                  [Op.lt]: 0,
               },
            },
            required: true,
         },
      ],
   });

   logger.info(
      { count: driversWithNegativeBalance.length },
      'Found drivers with negative balance',
   );

   let sentCount = 0;
   let throttledCount = 0;

   // PERF-3: батчевая обработка — BATCH_SIZE параллельных операций вместо последовательных
   for (let i = 0; i < driversWithNegativeBalance.length; i += BATCH_SIZE) {
      const batch = driversWithNegativeBalance.slice(i, i + BATCH_SIZE);

      // Получаем throttle-статус всего батча одним pipeline-запросом
      const pipeline = redisClient.multi();
      for (const driver of batch) {
         pipeline.get(`negative_balance_reminder:${driver.id}`);
      }
      const throttleResults = await pipeline.exec();

      // Отбираем водителей, которым ещё не отправляли напоминание сегодня
      const toNotify = batch.filter(
         (_, idx) => !(throttleResults as any[])[idx],
      );
      throttledCount += batch.length - toNotify.length;

      const results = await Promise.allSettled(
         toNotify.map(async (driver) => {
            await publishWalletNotification({
               recipientId: driver.id,
               eventType: 'negative_balance',
               metadata: {
                  walletId: driver.wallet.id,
                  userId: driver.id,
                  balance: driver.wallet.balance,
               },
               translation: {
                  key: 'notification.wallet.negative_balance.driver',
                  params: {
                     balance: driver.wallet.balance,
                  },
                  titleKey: 'title.wallet.negative_balance',
               },
            });

            // Устанавливаем throttle на 24 часа
            await redisClient.setex(
               `negative_balance_reminder:${driver.id}`,
               86400,
               Date.now().toString(),
            );
         }),
      );

      for (const [idx, result] of results.entries()) {
         if (result.status === 'rejected') {
            logger.error(
               { err: result.reason, driverId: toNotify[idx].id },
               'Failed to send negative balance reminder',
            );
         } else {
            sentCount++;
            logger.info(
               {
                  driverId: toNotify[idx].id,
                  balance: toNotify[idx].wallet.balance,
               },
               'Negative balance reminder sent',
            );
         }
      }
   }

   logger.info(
      {
         total: driversWithNegativeBalance.length,
         sent: sentCount,
         throttled: throttledCount,
      },
      'Negative balance reminders completed',
   );
};
