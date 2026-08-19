import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import logger from '../../../../shared/utils/logger';
import * as tripService from '../../../trips/service/tripCrudService';
import * as tripsRepository from '../repository/tripsRepository';
import * as adminLogService from '../../log/service/adminLogService';
import { updateTripDto } from '../../../trips/models/dto/tripUpdateDto';
import db from '../../../../shared/config/database';
import Booking, { BookingStatus } from '../../../booking/models/Booking';
import Trip, { TripStatus } from '../../../trips/models/Trip';
import {
   NotFoundError,
   BadRequestError,
} from '../../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../../shared/utils/errorCodes';
import { clearCache } from '../../../../shared/config/redis';

const tripSnapshot = (trip: Trip | null) => {
   if (!trip) return undefined;
   return {
      label: `${trip.from_city} → ${trip.to_city}`,
      subLabel: trip.departure_ts
         ? new Date(trip.departure_ts).toISOString()
         : undefined,
      meta: {
         status: trip.status,
         price: trip.price_per_person,
         seats: trip.seats_available,
         driverId: trip.driver_id,
      },
   };
};

export const editTripByAdmin = async (
   adminId: string,
   tripId: string,
   updateData: updateTripDto,
) => {
   const before = await Trip.findByPk(tripId);
   const updatedTrip = await tripService.updateTripByAdmin(tripId, updateData);
   const after = await Trip.findByPk(tripId);

   await adminLogService.logAction(
      adminId,
      AdminAction.EDIT_TRIP,
      undefined,
      tripId,
      AdminLogEntityType.TRIP,
      {
         snapshot: tripSnapshot(after || before),
         metadata: {
            changes: updateData,
            before: before
               ? {
                    from_city: before.from_city,
                    to_city: before.to_city,
                    departure_ts: before.departure_ts,
                    seats_available: before.seats_available,
                    price_per_person: before.price_per_person,
                    status: before.status,
                 }
               : null,
         },
      },
   );
   return updatedTrip;
};

export const deleteTripByAdmin = async (adminId: string, tripId: string) => {
   const trip = await Trip.findByPk(tripId);
   await tripService.deleteTripByAdmin(tripId);
   await adminLogService.logAction(
      adminId,
      AdminAction.DELETE_TRIP,
      undefined,
      tripId,
      AdminLogEntityType.TRIP,
      { snapshot: tripSnapshot(trip) },
   );
   return { message: 'Trip deleted successfully by admin.' };
};

export const getAllTrips = async (query: any) => {
   const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      status,
      // Date range — поддерживаем как legacy (startDate/endDate),
      // так и новый формат (range/from/to из shared/utils/dateRange).
      startDate,
      endDate,
      range,
      from,
      to,
      dateField,
   } = query;

   const offset = (page - 1) * limit;

   const { count, rows } = await tripsRepository.findAllTrips({
      limit: Number(limit),
      offset: Number(offset),
      sortBy,
      sortOrder,
      search,
      status,
      startDate,
      endDate,
      range,
      from,
      to,
      dateField,
   });

   return {
      trips: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
   };
};

export const getTripDetailsById = async (tripId: string) => {
   const trip = await tripsRepository.findTripById(tripId);

   if (!trip) {
      throw new NotFoundError('Trip not found.', ErrorCode.TRIP_NOT_FOUND);
   }

   return trip;
};

export const changeBookingStatusByAdmin = async (
   adminId: string,
   bookingId: string,
   newStatus: string,
   reason?: string,
) => {
   const t = await db.transaction();
   try {
      const booking = await Booking.findByPk(bookingId, {
         transaction: t,
         lock: true,
      });
      if (!booking) throw new NotFoundError('Booking not found.');

      const oldStatus = booking.status;

      const validTransitions: Record<string, string[]> = {
         CONFIRMED: ['CANCELLED'], // отменить подтверждённую
         PENDING: ['CANCELLED', 'CONFIRMED'], // отменить или подтвердить pending
         CANCELLED: ['PENDING'], // восстановить отменённую → pending
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
         throw new BadRequestError(
            `Cannot change booking status from ${oldStatus} to ${newStatus}.`,
         );
      }

      if (
         newStatus === BookingStatus.CANCELLED &&
         oldStatus === BookingStatus.CONFIRMED
      ) {
         await Trip.increment('seats_available', {
            by: booking.seatsBooked,
            where: { id: booking.tripId },
            transaction: t,
         });
      }

      if (
         newStatus === BookingStatus.CONFIRMED &&
         oldStatus === BookingStatus.PENDING
      ) {
         const trip = await Trip.findByPk(booking.tripId, {
            transaction: t,
            lock: true,
         });
         if (!trip) throw new NotFoundError('Trip not found for this booking.');
         if (trip.seats_available < booking.seatsBooked) {
            throw new BadRequestError('Not enough seats available.');
         }
         await Trip.decrement('seats_available', {
            by: booking.seatsBooked,
            where: { id: booking.tripId },
            transaction: t,
         });
      }

      booking.status = newStatus as BookingStatus;
      if (reason && newStatus === BookingStatus.CANCELLED) {
         booking.cancellationReason = reason;
      }
      await booking.save({ transaction: t });
      await t.commit();

      await Promise.all([
         clearCache(`trip:details:${booking.tripId}:*`),
         clearCache(`user:bookings:${booking.passengerId}`),
         clearCache(`user:activity:${booking.passengerId}:*`),
      ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));

      await adminLogService.logAction(
         adminId,
         AdminAction.CHANGE_BOOKING_STATUS,
         reason || undefined,
         bookingId,
         AdminLogEntityType.BOOKING,
         {
            snapshot: {
               label: `Booking ${bookingId.slice(0, 8)}…`,
               subLabel: `${oldStatus} → ${newStatus}`,
               meta: {
                  tripId: booking.tripId,
                  passengerId: booking.passengerId,
                  seats: booking.seatsBooked,
               },
            },
            metadata: { oldStatus, newStatus, reason: reason ?? null },
         },
      );

      return { bookingId, oldStatus, newStatus };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const changeTripStatusByAdmin = async (
   adminId: string,
   tripId: string,
   newStatus: string,
   reason?: string,
) => {
   const t = await db.transaction();
   try {
      const trip = await Trip.findByPk(tripId, { transaction: t, lock: true });
      if (!trip) throw new NotFoundError('Trip not found.');

      const oldStatus = trip.status;

      // Допустимые переходы для админа:
      // IN_PROGRESS → CREATED  (откат: водитель случайно нажал старт)
      // IN_PROGRESS → CANCELED (отмена активной поездки)
      // CREATED     → CANCELED (отмена созданной поездки)
      const validTransitions: Record<string, string[]> = {
         IN_PROGRESS: ['CREATED', 'CANCELED'],
         CREATED: ['CANCELED'],
         CANCELED: ['CREATED'], // восстановление отменённой
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
         throw new BadRequestError(
            `Cannot change trip status from ${oldStatus} to ${newStatus}.`,
         );
      }

      if (oldStatus === TripStatus.InProgress && newStatus === 'CREATED') {
         trip.trip_start_ts = null;
      }

      if (newStatus === 'CANCELED') {
         const confirmedBookings = await Booking.findAll({
            where: { tripId, status: BookingStatus.CONFIRMED },
            transaction: t,
         });

         for (const booking of confirmedBookings) {
            booking.status = BookingStatus.CANCELLED;
            booking.cancellationReason = reason || 'Cancelled by admin';
            await booking.save({ transaction: t });

            clearCache(`user:bookings:${booking.passengerId}`).catch((err) =>
               logger.warn({ err }, 'Cache invalidation failed'),
            );
            clearCache(`user:activity:${booking.passengerId}:*`).catch(
               () => {},
            );
         }
      }

      trip.status = newStatus as TripStatus;
      await trip.save({ transaction: t });
      await t.commit();

      await Promise.all([
         clearCache(`trip:details:${tripId}:*`),
         clearCache('trip:search:*'),
         clearCache(`user:activity:${trip.driver_id}:*`),
      ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));

      await adminLogService.logAction(
         adminId,
         AdminAction.CHANGE_TRIP_STATUS,
         reason || undefined,
         tripId,
         AdminLogEntityType.TRIP,
         {
            snapshot: tripSnapshot(trip),
            metadata: { oldStatus, newStatus, reason: reason ?? null },
         },
      );

      return { tripId, oldStatus, newStatus };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};
