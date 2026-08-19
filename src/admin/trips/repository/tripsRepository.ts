import Car from '../../../car/model/Car';
import User from '../../../user/models/User';
import { col, Op, where } from 'sequelize';
import Trip, { TripStatus } from '../../../trips/models/Trip';
import Booking, { BookingStatus } from '../../../booking/models/Booking';
import {
   DateRangeInput,
   getDateRangeBounds,
} from '../../../../shared/utils/dateRange';

export const findAllTrips = async (
   options: DateRangeInput & {
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: string;
      search?: string;
      status?: TripStatus;
      /** На какое поле применять диапазон дат: departure_ts (default) | created_at. */
      dateField?: 'departure_ts' | 'created_at';
   },
) => {
   const {
      limit,
      offset,
      sortBy,
      sortOrder,
      search,
      status,
      dateField = 'departure_ts',
   } = options;
   const whereClause: any = {};

   if (status) {
      whereClause.status = status;
   }

   if (search) {
      const searchConditions: any[] = [
         { from_address: { [Op.iLike]: `%${search}%` } },
         { to_address: { [Op.iLike]: `%${search}%` } },
         { from_city: { [Op.iLike]: `%${search}%` } },
         { to_city: { [Op.iLike]: `%${search}%` } },
         { '$driver.firstName$': { [Op.iLike]: `%${search}%` } },
         { '$driver.lastName$': { [Op.iLike]: `%${search}%` } },
         { '$driver.phoneNumber$': { [Op.iLike]: `%${search}%` } },
      ];

      // Добавляем поиск по ID только если это валидный UUID, иначе Postgres падает с ошибкой 500
      const uuidRegex =
         /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;
      if (uuidRegex.test(search)) {
         searchConditions.push({ id: search });
         searchConditions.push({ driver_id: search });
      }

      whereClause[Op.or] = searchConditions;
   }

   // Диапазон дат (today/yesterday/week/month/quarter/year/custom).
   // Поддерживаем legacy startDate/endDate (читается getDateRangeBounds).
   const bounds = getDateRangeBounds(options);
   if (bounds) {
      whereClause[dateField] = { [Op.between]: [bounds.start, bounds.end] };
   }

   let orderClause: any = [[sortBy, sortOrder]];
   if (sortBy === 'driver.firstName') {
      orderClause = [[{ model: User, as: 'driver' }, 'firstName', sortOrder]];
   }

   return await Trip.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: orderClause,
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
         {
            model: Car,
            as: 'car',
            attributes: ['id', 'make', 'model', 'color', 'govNumber'],
         },
         // bookings подгружаем отдельным запросом (separate: true), чтобы избежать
         // картезианского произведения и проблем с LIMIT при hasMany-include.
         {
            model: Booking,
            as: 'bookings',
            required: false,
            separate: true,
            where: {
               status: {
                  [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
               },
            },
            attributes: [
               'id',
               'status',
               'seatsBooked',
               'totalPrice',
               'from_city',
               'to_city',
               'passengerId',
               'createdAt',
            ],
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
                  ],
               },
            ],
         },
      ],
      distinct: true, // Важно для правильного подсчета при include
   });
};

export const findTripById = async (tripId: string): Promise<Trip | null> => {
   return await Trip.findByPk(tripId, {
      include: [
         {
            model: User,
            as: 'driver',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'avatar',
               'rating',
               'talkative',
               'music_allowed',
            ],
         },
         {
            model: Booking,
            as: 'bookings',
            required: false,
            where: {
               status: {
                  [Op.ne]: BookingStatus.FAILED,
               },
            },
            attributes: ['id', 'seatsBooked', 'status'],
            include: [
               {
                  model: User,
                  as: 'passenger',
                  attributes: [
                     'id',
                     'firstName',
                     'lastName',
                     'avatar',
                     'rating',
                  ],
               },
            ],
         },
         {
            model: Car,
            as: 'car',
         },
      ],
   });
};
