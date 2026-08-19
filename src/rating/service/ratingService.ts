import { TripStatus } from '../../trips/models/Trip';
import db from '../../../shared/config/database';
import * as ratingRepository from '../repository/ratingRepository';
import {
   BadRequestError,
   ForbiddenError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import * as userRepository from '../../user/repository/userRepository';
import { clearCache, getOrSetCache } from '../../../shared/config/redis';
import { publishRatingNotification } from '../../workers/queues/notificationQueue';
import logger from '../../../shared/utils/logger';

interface CreateRatingDto {
   tripId: string;
   ratingById: string; // The user giving the rating
   ratedUserId: string; // The user being rated
   rating: number;
   feedback?: string;
}

export const createRating = async (data: CreateRatingDto) => {
   const { tripId, ratingById, ratedUserId, rating, feedback } = data;

   if (ratingById === ratedUserId) {
      throw new BadRequestError(
         'Users cannot rate themselves.',
         ErrorCode.RATING_SELF_NOT_ALLOWED,
      );
   }

   const { newRating, notif } = await db.transaction(async (t) => {
      const trip = await ratingRepository.findTripById(tripId, t);
      if (!trip) {
         throw new NotFoundError('Trip not found.', ErrorCode.TRIP_NOT_FOUND);
      }
      if (trip.status !== TripStatus.Completed) {
         throw new BadRequestError(
            'Can only rate completed trips.',
            ErrorCode.RATING_TRIP_NOT_COMPLETED,
         );
      }

      const isDriver = trip.driver_id === ratingById;
      const isRatedUserDriver = trip.driver_id === ratedUserId;

      // Последовательно: параллелить запросы внутри одной Sequelize-транзакции
      // нельзя — оба идут по одному соединению
      const isPassenger = await ratingRepository.findBookingByTripAndPassenger(
         tripId,
         ratingById,
         t,
      );
      const isRatedUserPassenger =
         await ratingRepository.findBookingByTripAndPassenger(
            tripId,
            ratedUserId,
            t,
         );

      if (!isDriver && !isPassenger) {
         throw new ForbiddenError(
            'User was not part of this trip.',
            ErrorCode.RATING_NOT_TRIP_PARTICIPANT,
         );
      }

      if (!isRatedUserDriver && !isRatedUserPassenger) {
         throw new ForbiddenError(
            'Rated user was not part of this trip.',
            ErrorCode.RATING_NOT_TRIP_PARTICIPANT,
         );
      }

      const newRating = await ratingRepository.createRating(
         {
            tripId,
            ratingById,
            ratedUserId,
            rating,
            feedback,
         },
         t,
      );

      const newAverage = await ratingRepository.getAverageRatingForUser(
         ratedUserId,
         t,
      );

      await ratingRepository.updateUserRating(
         ratedUserId,
         newAverage || rating,
         t,
      );

      const ratingByFirstName = isDriver
         ? (trip as any).driver?.firstName || 'Driver'
         : (isPassenger as any)?.passenger?.firstName || 'Passenger';

      return {
         newRating,
         notif: { ratingByFirstName, newAverage },
      };
   });

   // Кэш и уведомление — строго после commit: при откате транзакции наружу
   // не должно уйти уведомление о несуществующей оценке
   clearCache(`user:ratings:${data.ratedUserId}:*`).catch((err) =>
      logger.warn(
         { err, ratedUserId: data.ratedUserId },
         'Failed to invalidate ratings cache',
      ),
   );

   publishRatingNotification({
      recipientId: ratedUserId,
      eventType: 'rating_given',
      metadata: {
         ratingById: ratingById,
         ratedUserId: ratedUserId,
         tripId: tripId,
      },
      translation: {
         key: 'notification.rating.received',
         params: {
            passengerName: notif.ratingByFirstName,
            rating: (notif.newAverage || rating).toString(),
         },
         titleKey: 'title.rating',
      },
   }).catch((err) =>
      logger.error(
         { err, ratedUserId: ratedUserId },
         'Failed to send rating_received notification to rated user',
      ),
   );

   return newRating;
};

export const getRatingsForUser = async (
   userId: string,
   page: number = 1,
   limit: number = 10,
) => {
   const cacheKey = `user:ratings:${userId}:page:${page}:limit:${limit}`;
   return await getOrSetCache(
      cacheKey,
      async () => {
         const user = await userRepository.findUserById(userId);
         if (!user) {
            throw new NotFoundError(
               'User not found.',
               ErrorCode.USER_NOT_FOUND,
            );
         }

         const offset = (page - 1) * limit;
         const { count, rows: ratings } =
            await ratingRepository.findRatingsForUser(userId, limit, offset);

         return {
            averageRating: user.rating,
            totalRatings: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            ratings: ratings,
         };
      },
      600, // TTL: 10 минут (рейтинги меняются не часто)
   );
};
