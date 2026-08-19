import { Op } from 'sequelize';
import Booking, { BookingStatus } from '../../../booking/models/Booking';
import Trip from '../../../trips/models/Trip';
import User from '../../../user/models/User';
import {
   DateRangeInput,
   getDateRangeBounds,
} from '../../../../shared/utils/dateRange';

export interface FindAllBookingsOptions extends DateRangeInput {
   limit: number;
   offset: number;
   sortBy: string;
   sortOrder: 'ASC' | 'DESC';
   search?: string;
   status?: BookingStatus;
   tripId?: string;
   passengerId?: string;
   driverId?: string;
   fromCity?: string;
   toCity?: string;
   /** На какое поле применять диапазон дат: createdAt | trip.departure_ts. */
   dateField?: 'createdAt' | 'departure_ts';
}

const UUID_RE =
   /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SORTABLE_DIRECT = new Set([
   'createdAt',
   'updatedAt',
   'totalPrice',
   'seatsBooked',
   'status',
]);

export const findAllBookings = async (options: FindAllBookingsOptions) => {
   const {
      limit,
      offset,
      sortBy,
      sortOrder,
      search,
      status,
      tripId,
      passengerId,
      driverId,
      fromCity,
      toCity,
      dateField = 'createdAt',
   } = options;

   const whereClause: any = {};
   const tripWhere: any = {};

   if (status) whereClause.status = status;
   if (tripId) whereClause.tripId = tripId;
   if (passengerId) whereClause.passengerId = passengerId;
   if (fromCity) whereClause.from_city = { [Op.iLike]: `%${fromCity}%` };
   if (toCity) whereClause.to_city = { [Op.iLike]: `%${toCity}%` };
   if (driverId) tripWhere.driver_id = driverId;

   const bounds = getDateRangeBounds(options);
   if (bounds) {
      if (dateField === 'departure_ts') {
         tripWhere.departure_ts = { [Op.between]: [bounds.start, bounds.end] };
      } else {
         whereClause.createdAt = { [Op.between]: [bounds.start, bounds.end] };
      }
   }

   if (search && search.trim().length > 0) {
      const term = search.trim();
      const or: any[] = [
         { from_city: { [Op.iLike]: `%${term}%` } },
         { to_city: { [Op.iLike]: `%${term}%` } },
         { from_address: { [Op.iLike]: `%${term}%` } },
         { to_address: { [Op.iLike]: `%${term}%` } },
         { '$passenger.firstName$': { [Op.iLike]: `%${term}%` } },
         { '$passenger.lastName$': { [Op.iLike]: `%${term}%` } },
         { '$passenger.phoneNumber$': { [Op.iLike]: `%${term}%` } },
         { '$trip.driver.firstName$': { [Op.iLike]: `%${term}%` } },
         { '$trip.driver.lastName$': { [Op.iLike]: `%${term}%` } },
         { '$trip.driver.phoneNumber$': { [Op.iLike]: `%${term}%` } },
      ];
      if (UUID_RE.test(term)) {
         or.push({ id: term });
         or.push({ tripId: term });
         or.push({ passengerId: term });
      }
      whereClause[Op.or] = or;
   }

   let order: any[] = [['createdAt', sortOrder]];
   if (SORTABLE_DIRECT.has(sortBy)) {
      order = [[sortBy, sortOrder]];
   } else if (sortBy === 'departure_ts') {
      order = [[{ model: Trip, as: 'trip' }, 'departure_ts', sortOrder]];
   } else if (sortBy === 'passenger.firstName') {
      order = [[{ model: User, as: 'passenger' }, 'firstName', sortOrder]];
   } else if (sortBy === 'driver.firstName') {
      order = [
         [
            { model: Trip, as: 'trip' },
            { model: User, as: 'driver' },
            'firstName',
            sortOrder,
         ],
      ];
   }

   return await Booking.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order,
      distinct: true,
      include: [
         {
            model: User,
            as: 'passenger',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'phoneNumber',
               'avatar',
               'rating',
               'role',
            ],
         },
         {
            model: Trip,
            as: 'trip',
            required: Object.keys(tripWhere).length > 0,
            where: Object.keys(tripWhere).length > 0 ? tripWhere : undefined,
            attributes: [
               'id',
               'driver_id',
               'from_city',
               'to_city',
               'departure_ts',
               'arrival_ts',
               'price_per_person',
               'status',
            ],
            include: [
               {
                  model: User,
                  as: 'driver',
                  attributes: [
                     'id',
                     'firstName',
                     'lastName',
                     'phoneNumber',
                     'avatar',
                     'rating',
                  ],
               },
            ],
         },
      ],
   });
};

export const findBookingById = async (bookingId: string) => {
   return await Booking.findByPk(bookingId, {
      include: [
         {
            model: User,
            as: 'passenger',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'phoneNumber',
               'avatar',
               'rating',
               'role',
               'registration_source',
            ],
         },
         {
            model: Trip,
            as: 'trip',
            include: [
               {
                  model: User,
                  as: 'driver',
                  attributes: [
                     'id',
                     'firstName',
                     'lastName',
                     'phoneNumber',
                     'avatar',
                     'rating',
                     'registration_source',
                  ],
               },
            ],
         },
      ],
   });
};
