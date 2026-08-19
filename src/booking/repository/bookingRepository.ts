import Booking from '../models/Booking';
import User from '../../user/models/User';
import Car from '../../car/model/Car';
import { BookingStatus } from '../models/Booking';
import { Op, Sequelize, Transaction } from 'sequelize';
import Trip from '../../trips/models/Trip';

export interface CreateBookingData {
   tripId: string;
   passengerId: string;
   seatsBooked: number;

   pickup_latitude: number;
   pickup_longitude: number;
   dropoff_latitude: number;
   dropoff_longitude: number;

   from_city: string;
   to_city: string;

   from_address: string;
   to_address: string;

   totalPrice: number;
   status: BookingStatus;
}

export interface FindBookingOptions {
   id?: string;
   tripId?: string;
   passengerId?: string;
   status?: BookingStatus | BookingStatus[];
   transaction?: Transaction;
   lock?: boolean;
}

export const findBookingsByUserId = async (passengerId: string) => {
   return Booking.findAll({
      where: { passengerId },
      include: [
         {
            model: Trip,
            as: 'trip',
            include: [
               {
                  model: User,
                  as: 'driver',
                  attributes: ['id', 'firstName', 'lastName'],
               },
               {
                  model: Car,
                  as: 'car',
                  attributes: ['id', 'license_plate', 'color'],
               },
            ],
         },
      ],
      order: [['createdAt', 'DESC']],
   });
};

export const createBooking = async (
   data: CreateBookingData,
   transaction?: Transaction,
): Promise<Booking> => {
   return await Booking.create(data, { transaction });
};

export const findBookingByOptions = async (
   options: FindBookingOptions,
): Promise<Booking | null> => {
   const whereClause: any = {};

   if (options.id) whereClause.id = options.id;
   if (options.tripId) whereClause.tripId = options.tripId;
   if (options.passengerId) whereClause.passengerId = options.passengerId;

   if (options.status) {
      if (Array.isArray(options.status)) {
         whereClause.status = { [Op.in]: options.status };
      } else {
         whereClause.status = options.status;
      }
   }

   const queryOptions: any = { where: whereClause };

   if (options.transaction) {
      queryOptions.transaction = options.transaction;
      if (options.lock) {
         queryOptions.lock = options.transaction.LOCK.UPDATE;
      }
   }

   return await Booking.findOne(queryOptions);
};

export const findBookingWithTripDetails = async (
   options: FindBookingOptions,
) => {
   return await Booking.findOne({
      where: {
         id: options.id,
         passengerId: options.passengerId,
         status: options.status,
      },
      include: [
         {
            model: Trip,
            as: 'trip',
            attributes: ['driver_id'],
            required: true,
         },
      ],
      transaction: options.transaction,
      lock: true,
   });
};

export const findBookingForDriver = async (
   bookingId: string,
   driverId: string,
   transaction?: Transaction,
): Promise<Booking | null> => {
   return await Booking.findOne({
      where: {
         id: bookingId,
         status: {
            [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
         },
      },
      include: [
         {
            model: Trip,
            as: 'trip',
            required: true,
            attributes: [],
            where: {
               driver_id: driverId,
            },
         },
         {
            model: User,
            as: 'passenger',
            required: true,
            attributes: [
               'id',
               'firstName',
               'avatar',
               'lastName',
               'rating',
               [
                  Sequelize.literal(
                     '(SELECT COUNT(*)::int FROM ratings r WHERE r.rated_user_id = "passenger"."id")',
                  ),
                  'rating_count',
               ],
            ],
         },
      ],
      transaction,
   });
};

export const findBookingExcludingStatuses = async (
   tripId: string,
   passengerId: string,
   excludeStatuses: BookingStatus[],
   transaction?: Transaction,
): Promise<Booking | null> => {
   const queryOptions: any = {
      where: {
         tripId,
         passengerId,
         status: { [Op.notIn]: excludeStatuses },
      },
   };

   if (transaction) {
      queryOptions.transaction = transaction;
   }

   return await Booking.findOne(queryOptions);
};

export const cancelBookingWithReason = async (
   bookingId: string,
   reason: string,
   transaction: Transaction,
   status: BookingStatus = BookingStatus.CANCELLED,
): Promise<void> => {
   await Booking.update(
      {
         status,
         cancellationReason: reason,
      },
      {
         where: { id: bookingId },
         transaction,
      },
   );
};

export const updateBookingStatus = async (
   bookingId: string,
   status: BookingStatus,
   transaction?: Transaction,
): Promise<void> => {
   await Booking.update(
      { status },
      {
         where: { id: bookingId },
         transaction,
      },
   );
};

export const saveBooking = async (
   booking: Booking,
   transaction?: Transaction,
): Promise<Booking> => {
   return await booking.save({ transaction });
};

export const findAllBookings = async (
   tripId: string,
   transaction?: Transaction,
) => {
   return await Booking.findAll({
      where: {
         tripId,
         status: {
            [Op.in]: [BookingStatus.CONFIRMED],
         },
      },
      transaction,
   });
};

export const findAllBookingsByStatus = async (
   tripId: string,
   status: BookingStatus,
   transaction?: Transaction,
) => {
   return await Booking.findAll({
      where: {
         tripId,
         status: {
            [Op.in]: [status],
         },
      },
      transaction,
   });
};

export const findBookingsByTrip = async (
   tripId: string,
   status?: BookingStatus,
   transaction?: Transaction,
) => {
   const whereClause: any = { tripId };
   if (status) {
      whereClause.status = status;
   }

   return await Booking.findAll({
      where: whereClause,
      include: [
         {
            model: User,
            as: 'passenger',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'avatar',
               'phoneNumber',
            ],
         },
      ],
      order: [['createdAt', 'DESC']],
      transaction,
   });
};

export const countActiveBookings = async (
   tripId: string,
   transaction?: Transaction,
): Promise<number> => {
   return await Booking.count({
      where: {
         tripId,
         status: {
            [Op.in]: [BookingStatus.CONFIRMED],
         },
      },
      transaction,
   });
};

export const countConfirmedBookings = async (
   tripId: string,
   transaction?: Transaction,
): Promise<number> => {
   return await Booking.count({
      where: {
         tripId,
         status: BookingStatus.CONFIRMED,
      },
      transaction,
   });
};

// Один запрос для всех трипов страницы — нужен для is_booked в поиске
export const findBookedTripIdsByUser = async (
   passengerId: string,
   tripIds: string[],
): Promise<Set<string>> => {
   if (tripIds.length === 0) return new Set();
   const bookings = await Booking.findAll({
      where: {
         passengerId,
         tripId: { [Op.in]: tripIds },
         // Активной считается только PENDING/CONFIRMED бронь.
         // Терминальные статусы (CANCELLED, REJECTED, FAILED) — не booked.
         status: { [Op.in]: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
      attributes: ['tripId'],
   });
   return new Set(bookings.map((b) => b.tripId));
};
