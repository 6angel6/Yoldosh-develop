import { Op } from 'sequelize';
import { redisClient, getRedisAvailable } from '../config/redis';
import { User, UserLanguage } from '../../src/user/models/User';
import logger from './logger';

const CACHE_TTL_SECONDS = 3600;
const cacheKey = (userId: string) => `lang:sync:${userId}`;

export const syncUserLanguage = async (
   userId: string,
   languageFromRequest: UserLanguage,
): Promise<void> => {
   try {
      if (getRedisAvailable()) {
         const cached = await redisClient.get(cacheKey(userId));
         if (cached === languageFromRequest) {
            return;
         }
      }

      const [updatedRows] = await User.update(
         { preferredLanguage: languageFromRequest },
         {
            where: {
               id: userId,
               preferredLanguage: { [Op.ne]: languageFromRequest },
            },
         },
      );

      if (getRedisAvailable()) {
         await redisClient.setEx(
            cacheKey(userId),
            CACHE_TTL_SECONDS,
            languageFromRequest,
         );
      }

      if (updatedRows > 0) {
         logger.debug(
            { userId, language: languageFromRequest },
            'User preferred language synced from Accept-Language header',
         );
      }
   } catch (error) {
      logger.warn(
         { err: error, userId },
         'Failed to sync user preferred language',
      );
   }
};
