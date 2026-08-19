import logger from '../../../../shared/utils/logger';
import Notification from '../../../chat/models/Notification';
import { Op } from 'sequelize';

const DATA_RETENTION_DAYS = 7;

export const cleanupOldData = async (): Promise<void> => {
   logger.info('Starting old data cleanup');

   const cutoffDate = new Date(
      Date.now() - DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000,
   );

   const deletedNotifications = await Notification.destroy({
      where: {
         createdAt: {
            [Op.lt]: cutoffDate,
         },
      },
   });

   logger.info(
      { count: deletedNotifications, cutoffDate },
      'Old notifications deleted',
   );

   logger.info('Old data cleanup completed');
};
