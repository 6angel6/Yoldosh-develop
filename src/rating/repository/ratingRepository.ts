import Rating from '../models/Rating';
import Trip from '../../trips/models/Trip';
import User from '../../user/models/User';
import Booking from '../../booking/models/Booking';
import { Transaction, Sequelize } from 'sequelize';

export interface CreateRatingData {
   tripId: string;
   ratingById: string;
   ratedUserId: string;
   rating: number;
   feedback?: string;
}

export const findTripById = async (
   tripId: string,
   transaction?: Transaction,
): Promise<Trip | null> => {
   return await Trip.findByPk(tripId, {
      transaction,
      include: [
         {
            model: User,
            as: 'driver',
            attributes: ['id', 'firstName'],
         },
      ],
   });
};

export const findBookingByTripAndPassenger = async (
   tripId: string,
   passengerId: string,
   transaction?: Transaction,
): Promise<Booking | null> => {
   return await Booking.findOne({
      where: { tripId, passengerId },
      transaction,
      include: [
         {
            model: User,
            as: 'passenger',
            attributes: ['id', 'firstName'],
         },
      ],
   });
};

export const createRating = async (
   data: CreateRatingData,
   transaction?: Transaction,
): Promise<Rating> => {
   return await Rating.create(data, { transaction });
};

export const getAverageRatingForUser = async (
   ratedUserId: string,
   transaction?: Transaction,
): Promise<number> => {
   const queryOptions: any = {
      attributes: [[Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating']],
      where: { ratedUserId },
      raw: true,
   };

   if (transaction) {
      queryOptions.transaction = transaction;
   }

   const averageResult: any = await Rating.findOne(queryOptions);

   return averageResult && averageResult.avgRating
      ? parseFloat(parseFloat(averageResult.avgRating).toFixed(2))
      : 0;
};

export const updateUserRating = async (
   userId: string,
   newRating: number,
   transaction?: Transaction,
): Promise<void> => {
   await User.update(
      { rating: newRating },
      {
         where: { id: userId },
         transaction,
      },
   );
};

export const findRatingsForUser = async (
   ratedUserId: string,
   limit: number,
   offset: number,
): Promise<{ count: number; rows: Rating[] }> => {
   return await Rating.findAndCountAll({
      where: { ratedUserId },
      include: [
         {
            model: User,
            as: 'ratingBy',
            attributes: ['id', 'firstName', 'lastName', 'avatar'],
         },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
   });
};
