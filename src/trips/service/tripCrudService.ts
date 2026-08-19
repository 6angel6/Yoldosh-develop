import { TripAttributes, TripStatus, GarageStatus } from '../models/Trip';
import { BookingStatus } from '../../booking/models/Booking';
import * as tripRepository from '../repository/tripRepository';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { CreateTripData } from '../repository/tripRepository';
import * as promocodeRepository from '../../promocode/repository/promocodeRepository';
import * as bookingRepository from '../../booking/repository/bookingRepository';
import * as parcelRepository from '../../parcel/repository/parcelRepository';
import * as userRepository from '../../user/repository/userRepository';
import * as promocodeService from '../../promocode/service/promocodeService';
import logger from '../../../shared/utils/logger';
import {
   BadRequestError,
   ConflictError,
   ForbiddenError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import { createTripDto } from '../models/dto/tripCreateDto';
import { updateTripDto } from '../models/dto/tripUpdateDto';
import PromoCode from '../../promocode/models/PromoCode';
import { getGeoData } from '../../../shared/utils/geoData';
import * as cityResolver from '../../city/service/cityResolver';
import { getCurrentTimeUTC, isInPast } from '../../../shared/utils/timeUtils';
import { getOrSetCache, clearCache } from '../../../shared/config/redis';
import {
   formatTripResponse,
   formatTripForDriver,
   formatTripForPassenger,
   formatBaseTrip,
} from './tripFormatterService';
import { publishTripNotification } from '../../workers/queues/notificationQueue';
import { findAllBookingsByStatus } from '../../booking/repository/bookingRepository';

export const createTrip = async (driverId: string, tripData: createTripDto) => {
   const departureDate = tripData.departure_ts;
   if (isNaN(departureDate.getTime()) || isInPast(departureDate)) {
      throw new BadRequestError('Invalid or past departure date.');
   }

   const arrivalDate =
      tripData.duration != null
         ? new Date(
              departureDate.getTime() + Number(tripData.duration) * 60 * 1000,
           )
         : undefined;

   const [fromGeoData, toGeoData, fromCity, toCity] = await Promise.all([
      getGeoData(tripData.from_longitude, tripData.from_latitude),
      getGeoData(tripData.to_longitude, tripData.to_latitude),
      cityResolver.resolveStrictByPoint(
         tripData.from_longitude,
         tripData.from_latitude,
      ),
      cityResolver.resolveStrictByPoint(
         tripData.to_longitude,
         tripData.to_latitude,
      ),
   ]);

   if (!fromCity || !toCity) {
      logger.warn(
         {
            driverId,
            from: {
               lng: tripData.from_longitude,
               lat: tripData.from_latitude,
               resolved: !!fromCity,
            },
            to: {
               lng: tripData.to_longitude,
               lat: tripData.to_latitude,
               resolved: !!toCity,
            },
         },
         'Trip create: city resolver could not match one/both endpoints — trip will not appear in exact-match wave',
      );
   }

   const { formattedTrip, createdTripId, createdTripStatus } =
      await withDeadlockRetry(async (t) => {
         const car = await tripRepository.findCarByIdAndDriver(
            tripData.car_id,
            driverId,
            t,
         );

         if (!car) {
            throw new NotFoundError(
               'Car not found or does not belong to this driver.',
            );
         }
         // if ( todo: fix in prod
         //    car.status === CarStatus.PENDING ||
         //    car.status === CarStatus.REJECTED
         // ) {
         //    throw new BadRequestError(
         //       'Your car status have to be verifid to add it',
         //    );
         // }

         const maxAvailableSeats = car.seats;

         if (
            tripData.seats_available > maxAvailableSeats ||
            tripData.seats_available <= 0
         ) {
            throw new BadRequestError(
               `Available seats must be between 1 and ${maxAvailableSeats} (driver's seat is excluded).`,
            );
         }

         // const existingTrip = await tripRepository.findActiveTripByCar(
         //    tripData.car_id,
         //    t,
         // );
         //
         // if (existingTrip) {
         //    throw new ConflictError('This car already has an active trip.');
         // } todo: fix in prod just for testing

         const dataForRepo: CreateTripData = {
            driver_id: driverId,
            departure_ts: departureDate,
            arrival_ts: arrivalDate,

            car_id: tripData.car_id,
            seats_available: tripData.seats_available,
            price_per_person: tripData.price_per_person,
            max_two_back: tripData.max_two_back,
            comment: tripData.comment,

            from_latitude: tripData.from_latitude,
            from_longitude: tripData.from_longitude,
            to_latitude: tripData.to_latitude,
            to_longitude: tripData.to_longitude,

            from_address: fromGeoData.address,
            to_address: toGeoData.address,

            booking_type: tripData.booking_type,

            from_city: fromCity?.canonical_uz || fromGeoData.cityName,
            to_city: toCity?.canonical_uz || toGeoData.cityName,

            from_city_id: fromCity?.id ?? null,
            to_city_id: toCity?.id ?? null,

            distance: tripData.distance,
            duration: tripData.duration,

            conditioner: tripData.conditioner,
            smoking_allowed: tripData.smoking_allowed,
            door_pickup: tripData.door_pickup,
            food_stop: tripData.food_stop,
            garage: tripData.garage as GarageStatus,

            parcels_allowed: tripData.parcels_allowed,
            parcel_price: tripData.parcel_price,
         };

         const createdTrip = await tripRepository.createTrip(dataForRepo, t);

         return {
            formattedTrip: formatTripResponse(createdTrip, null),
            createdTripId: createdTrip.id,
            createdTripStatus: createdTrip.status,
         };
      });

   // Инвалидация кеша ПОСЛЕ commit — иначе параллельный поиск кэширует
   // результат без свежесозданного трипа (TX ещё не виден),
   // и трип не попадёт в выдачу до истечения TTL.
   Promise.all([
      clearCache('trip:search:*'),
      clearCache(`user:activity:${driverId}:*`),
      clearCache(`user:profile:${driverId}`),
   ]).catch((err) =>
      logger.warn({ err }, 'Failed to clear caches after trip create'),
   );

   // Уведомление отправляем ПОСЛЕ успешного commit — не дублируется при retry
   publishTripNotification({
      recipientId: driverId,
      eventType: 'created',
      metadata: {
         tripId: formattedTrip.id,
         status: createdTripStatus,
         driverId: driverId,
      },
      translation: {
         key: 'notification.trip.created.driver',
         titleKey: 'title.trip.created',
      },
   }).catch((err) =>
      logger.error(
         { err, tripId: formattedTrip.id },
         'Failed to send creation notification to driver',
      ),
   );

   return formattedTrip;
};

export const updateTrip = async (
   tripId: string,
   driverId: string,
   updateData: updateTripDto,
) => {
   const {
      formattedTrip,
      bookings,
      updatedTripId,
      updatedTripStatus,
      notifFromAddress,
      notifToAddress,
   } = await withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripByIdAndDriver(
         tripId,
         driverId,
         t,
         true,
      );
      if (!trip) {
         throw new NotFoundError(
            'Trip not found or you do not have permission to modify it.',
         );
      }

      if (trip.status !== TripStatus.Created) {
         throw new BadRequestError(
            'Only trips that have not started can be edited.',
         );
      }

      if (
         updateData.booking_type !== undefined &&
         updateData.booking_type !== trip.booking_type
      ) {
         const pendingBookings =
            await bookingRepository.findAllBookingsByStatus(
               tripId,
               BookingStatus.PENDING,
               t,
            );

         if (pendingBookings.length > 0) {
            throw new BadRequestError(
               'Cannot change booking type while there are pending booking requests. Please confirm or reject them first.',
            );
         }
      }

      // Выключить перевозку посылок можно только пока нет живых заявок —
      // иначе отправители остались бы с посылками на трипе «без посылок»
      if (updateData.parcels_allowed === false && trip.parcels_allowed) {
         const activeParcels = await parcelRepository.findActiveParcelsByTrip(
            tripId,
            t,
         );
         if (activeParcels.length > 0) {
            throw new BadRequestError(
               'Cannot disable parcels while there are active parcel requests. Please reject them first.',
            );
         }
      }

      const {
         from_latitude,
         from_longitude,
         to_latitude,
         to_longitude,
         seats_available,
         ...simpleUpdates
      } = updateData;

      const updatesToApply: Partial<TripAttributes> = { ...simpleUpdates };

      if (
         updateData.departure_ts !== undefined ||
         updateData.duration !== undefined
      ) {
         const baseDeparture = updateData.departure_ts ?? trip.departure_ts;
         const baseDuration = updateData.duration ?? trip.duration;
         if (baseDuration != null) {
            updatesToApply.arrival_ts = new Date(
               baseDeparture.getTime() + Number(baseDuration) * 60 * 1000,
            );
         }
      }

      const car = await tripRepository.findCarByIdAndDriver(
         trip.car_id,
         driverId,
         t,
      );
      if (!car) {
         throw new NotFoundError(
            'Car not found or does not belong to this driver.',
         );
      }

      const maxAvailableSeats = car.seats;

      if (
         updateData.seats_available !== undefined &&
         (updateData.seats_available > maxAvailableSeats ||
            updateData.seats_available <= 0)
      ) {
         throw new BadRequestError(
            `Available seats must be between 1 and ${maxAvailableSeats} (based on your tech passport).`,
         );
      }
      if (seats_available !== undefined) {
         updatesToApply.seats_available = seats_available;
      }

      if (from_latitude !== undefined && from_longitude !== undefined) {
         const fromGeoData = await getGeoData(from_longitude, from_latitude);
         updatesToApply.from_latitude = from_latitude;
         updatesToApply.from_longitude = from_longitude;
         updatesToApply.from_address = fromGeoData.address;
         updatesToApply.from_city = fromGeoData.cityName;
      }

      if (to_latitude !== undefined && to_longitude !== undefined) {
         const toGeoData = await getGeoData(to_longitude, to_latitude);
         updatesToApply.to_latitude = to_latitude;
         updatesToApply.to_longitude = to_longitude;
         updatesToApply.to_address = toGeoData.address;
         updatesToApply.to_city = toGeoData.cityName;
      }

      const updatedTrip = await tripRepository.updateTrip(
         trip,
         updatesToApply,
         t,
      );
      const notifFromAddress = updatesToApply.from_address || trip.from_address;
      const notifToAddress = updatesToApply.to_address || trip.to_address;

      const bookings = await findAllBookingsByStatus(
         tripId,
         BookingStatus.CONFIRMED,
         t,
      );

      await clearCache(`trip:details:${tripId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear trip details cache'),
      );
      await clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Failed to clear trip search cache'),
      );
      await clearCache(`user:activity:${driverId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear user activity cache'),
      );

      return {
         formattedTrip: formatTripResponse(updatedTrip, null),
         bookings,
         updatedTripId: updatedTrip.id,
         updatedTripStatus: updatedTrip.status,
         notifFromAddress,
         notifToAddress,
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   for (const booking of bookings) {
      publishTripNotification({
         recipientId: booking.passengerId,
         eventType: 'updated',
         metadata: {
            tripId: updatedTripId,
            status: updatedTripStatus,
            driverId: driverId,
         },
         translation: {
            key: 'notification.trip.updated.passenger',
            params: {
               fromAddress: notifFromAddress,
               toAddress: notifToAddress,
            },
            titleKey: 'title.trip.updated',
         },
      }).catch((err) =>
         logger.error(
            { err, tripId: updatedTripId },
            'Failed to send update trip notification to user',
         ),
      );
   }

   publishTripNotification({
      recipientId: driverId,
      eventType: 'updated',
      metadata: {
         tripId: updatedTripId,
         status: updatedTripStatus,
         driverId: driverId,
      },
      translation: {
         key: 'notification.trip.updated.driver',
         titleKey: 'title.trip.updated',
      },
   }).catch((err) =>
      logger.error(
         { err, tripId: updatedTripId },
         'Failed to send update trip notification to driver',
      ),
   );

   return formattedTrip;
};

export const getTripById = async (
   tripId: string,
   userId?: string,
   isDriver?: boolean,
) => {
   const cacheKey = `trip:details:${tripId}:${userId || 'anon'}:${isDriver ? 'driver' : 'passenger'}`;

   const tripData = await getOrSetCache(
      cacheKey,
      async () => {
         const trip = await tripRepository.findTripByIdForDriver(tripId);

         if (!trip) {
            throw new NotFoundError('Trip not found.');
         }

         const tripJson = trip.toJSON() as any;

         if (isDriver && trip.driver_id === userId) {
            return formatTripForDriver(tripJson);
         }

         if (userId && !isDriver) {
            const blocked = await userRepository.isUserBlocked(
               userId,
               tripJson.driver_id,
            );
            if (blocked) {
               throw new ForbiddenError('Trip not available.');
            }

            let userPromoCode: PromoCode | null = null;

            try {
               userPromoCode = await promocodeRepository.findByUserId(userId);

               if (
                  userPromoCode &&
                  userPromoCode.expiresAt &&
                  userPromoCode.expiresAt < getCurrentTimeUTC()
               ) {
                  await promocodeService.deactivatePromoCodeForUser(userId);
                  userPromoCode = null;
               }
            } catch (error) {
               logger.error(
                  { err: error, userId },
                  'Error fetching user promocode',
               );
               userPromoCode = null;
            }

            const userBooking = tripJson.bookings?.find(
               (booking: any) =>
                  booking.passengerId === userId &&
                  (booking.status === BookingStatus.CONFIRMED ||
                     booking.status === BookingStatus.PENDING),
            );

            return userBooking
               ? formatTripForPassenger(tripJson, userPromoCode, userBooking)
               : formatBaseTrip(tripJson);
         }

         return formatBaseTrip(tripJson);
      },
      300,
   );

   // Флаги контекста пользователя вычисляются ВНЕ кэша — всегда актуально
   const tripDriverId: string | null = (tripData as any).driver?.id ?? null;
   const isCurrentUserDriver = !!userId && tripDriverId === userId;

   let isBookedByUser = false;
   if (userId && !isCurrentUserDriver) {
      const bookedSet = await bookingRepository.findBookedTripIdsByUser(
         userId,
         [tripId],
      );
      isBookedByUser = bookedSet.has(tripId);
   }

   return {
      ...tripData,
      isCurrentUserDriver,
      isBookedByUser,
      is_booked: isBookedByUser,
   };
};

export const getTripBookings = async (
   tripId: string,
   driverId: string,
   status?: string,
) => {
   return withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripByIdAndDriver(
         tripId,
         driverId,
         t,
      );

      if (!trip) {
         throw new NotFoundError('Trip not found or you are not the driver');
      }

      const bookingStatus = status
         ? (status.toUpperCase() as BookingStatus)
         : undefined;
      const bookings = await bookingRepository.findBookingsByTrip(
         tripId,
         bookingStatus,
         t,
      );

      return bookings.map((booking) => ({
         id: booking.id,
         passengerId: booking.passengerId,
         passenger: booking.passenger
            ? {
                 id: booking.passenger.id,
                 firstName: booking.passenger.firstName,
                 lastName: booking.passenger.lastName,
                 avatar: booking.passenger.avatar,
                 phoneNumber: booking.passenger.phoneNumber,
              }
            : null,
         seatsBooked: booking.seatsBooked,
         totalPrice: booking.totalPrice,
         status: booking.status,
         pickup_latitude: booking.pickup_latitude,
         pickup_longitude: booking.pickup_longitude,
         dropoff_latitude: booking.dropoff_latitude,
         dropoff_longitude: booking.dropoff_longitude,
         from_address: booking.from_address,
         to_address: booking.to_address,
         created_at: booking.createdAt,
         updated_at: booking.updatedAt,
      }));
   });
};

export const deleteTrip = async (tripId: string, driverId: string) => {
   return withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripByIdAndDriver(
         tripId,
         driverId,
         t,
      );

      if (!trip) {
         throw new NotFoundError('Trip not found');
      }

      if (trip.status !== TripStatus.Created) {
         throw new BadRequestError('Only created trips can be deleted');
      }

      const bookingsCount = await bookingRepository.countActiveBookings(
         tripId,
         t,
      );
      if (bookingsCount > 0) {
         throw new ConflictError(
            'Cannot delete trip with bookings. Cancel trip instead.',
         );
      }

      // Трип soft-delete (paranoid), FK-каскад не сработает — активные
      // посылки зависли бы на удалённом трипе
      const activeParcels = await parcelRepository.findActiveParcelsByTrip(
         tripId,
         t,
      );
      if (activeParcels.length > 0) {
         throw new ConflictError(
            'Cannot delete trip with parcels. Cancel trip instead.',
         );
      }

      await tripRepository.deleteTrip(trip, t);

      await clearCache(`trip:details:${tripId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear trip details cache'),
      );
      await clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Failed to clear trip search cache'),
      );
      await clearCache(`user:activity:${driverId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear user activity cache'),
      );

      return { message: 'Trip deleted successfully' };
   });
};

export const updateTripByAdmin = async (
   tripId: string,
   updateData: updateTripDto,
) => {
   return withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripById(tripId, t);
      if (!trip) {
         throw new NotFoundError('Trip not found');
      }

      const updatesToApply: any = {};
      for (const key in updateData) {
         if (Object.prototype.hasOwnProperty.call(updateData, key)) {
            if (key === 'departure_ts' && updateData.departure_ts) {
               const newDepartureDate = new Date(updateData.departure_ts);
               if (
                  isNaN(newDepartureDate.getTime()) ||
                  isInPast(newDepartureDate)
               ) {
                  throw new BadRequestError('Invalid departure date or time.');
               }
               updatesToApply.departure_ts = newDepartureDate;
            } else if ((updateData as any)[key] !== undefined) {
               updatesToApply[key] = (updateData as any)[key];
            }
         }
      }

      const newDeparture = updatesToApply.departure_ts ?? trip.departure_ts;
      const newDuration = updatesToApply.duration ?? trip.duration;
      if (
         (updatesToApply.departure_ts !== undefined ||
            updatesToApply.duration !== undefined) &&
         newDuration != null
      ) {
         updatesToApply.arrival_ts = new Date(
            new Date(newDeparture).getTime() + Number(newDuration) * 60 * 1000,
         );
      }

      const updatedTrip = await tripRepository.updateTrip(
         trip,
         updatesToApply,
         t,
      );

      await clearCache(`trip:details:${tripId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear trip details cache'),
      );
      await clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Failed to clear trip search cache'),
      );
      await clearCache(`user:activity:${trip.driver_id}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear user activity cache'),
      );

      return formatTripResponse(updatedTrip, null);
   });
};

export const deleteTripByAdmin = async (tripId: string) => {
   return withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripById(tripId, t);
      if (!trip) {
         throw new NotFoundError('Trip not found');
      }

      await tripRepository.deleteTrip(trip, t);

      await clearCache(`trip:details:${tripId}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear trip details cache'),
      );
      await clearCache('trip:search:*').catch((err) =>
         logger.warn({ err }, 'Failed to clear trip search cache'),
      );
      await clearCache(`user:activity:${trip.driver_id}:*`).catch((err) =>
         logger.warn({ err }, 'Failed to clear user activity cache'),
      );

      return { message: 'Trip deleted successfully' };
   });
};

export const getBestTrips = async (limit: number = 5) => {
   const cacheKey = `trip:search:best:${limit}`;

   const cached = await getOrSetCache(
      cacheKey,
      async () => {
         const rows = await tripRepository.findBestTrips(limit);
         return {
            trips: rows.map((trip) => formatTripResponse(trip, null)),
         };
      },
      300,
   );

   const nowMs = getCurrentTimeUTC().getTime();
   return {
      ...cached,
      trips: cached.trips.filter(
         (t: any) => new Date(t.departure_ts).getTime() >= nowMs,
      ),
   };
};
