import { BookingStatus } from '../../../booking/models/Booking';
import * as bookingsRepository from '../repository/bookingsRepository';
import { NotFoundError } from '../../../../shared/utils/errorHandler';
import type { FindAllBookingsOptions } from '../repository/bookingsRepository';

export interface GetAllBookingsQuery {
   page?: string | number;
   limit?: string | number;
   sortBy?: string;
   sortOrder?: string;
   search?: string;
   status?: string;
   tripId?: string;
   passengerId?: string;
   driverId?: string;
   fromCity?: string;
   toCity?: string;
   range?: string;
   from?: string;
   to?: string;
   startDate?: string;
   endDate?: string;
   dateField?: string;
}

export const getAllBookings = async (query: GetAllBookingsQuery) => {
   const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
   const limit = Math.min(
      200,
      Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
   );
   const offset = (page - 1) * limit;

   const sortOrder =
      String(query.sortOrder || 'DESC').toUpperCase() === 'ASC'
         ? 'ASC'
         : 'DESC';

   const status =
      query.status &&
      Object.values(BookingStatus).includes(query.status as BookingStatus)
         ? (query.status as BookingStatus)
         : undefined;

   const dateField: FindAllBookingsOptions['dateField'] =
      query.dateField === 'departure_ts' ? 'departure_ts' : 'createdAt';

   const { count, rows } = await bookingsRepository.findAllBookings({
      limit,
      offset,
      sortBy: query.sortBy || 'createdAt',
      sortOrder,
      search: query.search,
      status,
      tripId: query.tripId,
      passengerId: query.passengerId,
      driverId: query.driverId,
      fromCity: query.fromCity,
      toCity: query.toCity,
      range: query.range,
      from: query.from,
      to: query.to,
      startDate: query.startDate,
      endDate: query.endDate,
      dateField,
   });

   return {
      bookings: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const getBookingById = async (bookingId: string) => {
   const booking = await bookingsRepository.findBookingById(bookingId);
   if (!booking) {
      throw new NotFoundError('Booking not found.');
   }
   return booking;
};
