import { Decimal } from 'decimal.js';
import Parcel, { ParcelStatus } from '../models/Parcel';

import * as parcelRepository from '../repository/parcelRepository';
import * as tripRepository from '../../trips/repository/tripRepository';
import * as userRepository from '../../user/repository/userRepository';

import { clearCache, getOrSetCache } from '../../../shared/config/redis';
import logger from '../../../shared/utils/logger';
import {
   BadRequestError,
   NotFoundError,
   ForbiddenError,
} from '../../../shared/utils/errorHandler';
import { createParcelDto } from '../models/dto/parcelDto';
import { getGeoData } from '../../../shared/utils/geoData';
import { BookingType, TripStatus } from '../../trips/models/Trip';
import { publishParcelNotification } from '../../workers/queues/notificationQueue';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';

const formatParcelResponse = (parcel: Parcel) => {
   const parcelJson = parcel.toJSON() as any;

   const {
      pickup_latitude,
      pickup_longitude,
      dropoff_latitude,
      dropoff_longitude,
      from_city,
      to_city,
      from_address,
      to_address,
      price,
      ...rest
   } = parcelJson;

   return {
      ...rest,
      price: parseFloat(String(price)),
      pickup_location: {
         city: from_city,
         address: from_address,
         coordinates: {
            latitude: parseFloat(String(pickup_latitude)),
            longitude: parseFloat(String(pickup_longitude)),
         },
      },
      dropoff_location: {
         city: to_city,
         address: to_address,
         coordinates: {
            latitude: parseFloat(String(dropoff_latitude)),
            longitude: parseFloat(String(dropoff_longitude)),
         },
      },
   };
};

const clearParcelCaches = (
   tripId: string,
   senderId: string,
   driverId: string,
) => {
   Promise.all([
      clearCache(`trip:details:${tripId}:*`),
      clearCache(`user:parcels:${senderId}`),
      clearCache(`user:activity:${senderId}:*`),
      clearCache(`user:activity:${driverId}:*`),
   ]).catch((err) => logger.warn({ err }, 'Parcel cache invalidation failed'));
};

/**
 * Создание посылки: только точка А (забор) и точка Б (выдача), о самой
 * посылке ничего не известно (как в Яндекс Доставке). Флоу как у брони —
 * по booking_type трипа: INSTANT → сразу CONFIRMED, REQUEST → PENDING.
 * Места (seats_available) посылка не занимает, лимита по количеству нет.
 */
export const createParcel = async (data: createParcelDto, senderId: string) => {
   const {
      tripId,
      pickup_latitude,
      pickup_longitude,
      dropoff_latitude,
      dropoff_longitude,
   } = data;

   const [pickupGeo, dropoffGeo] = await Promise.all([
      getGeoData(pickup_longitude, pickup_latitude),
      getGeoData(dropoff_longitude, dropoff_latitude),
   ]);

   const { parcel, _notif } = await withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripByIdWithLock(tripId, t);

      if (!trip) {
         throw new NotFoundError('Trip not found.');
      }
      if (!trip.parcels_allowed) {
         throw new BadRequestError(
            'The driver does not carry parcels on this trip.',
         );
      }
      if (trip.status !== TripStatus.Created) {
         throw new BadRequestError(
            'Parcels can only be added to trips that have not started.',
         );
      }
      if (trip.driver_id === senderId) {
         throw new BadRequestError(
            'Driver cannot send a parcel with their own trip.',
         );
      }

      const blocked = await userRepository.isUserBlocked(
         senderId,
         trip.driver_id,
      );
      if (blocked) {
         throw new ForbiddenError('You cannot send a parcel with this trip.');
      }

      const existingParcel =
         await parcelRepository.findActiveParcelBySenderAndTrip(
            tripId,
            senderId,
            t,
         );
      if (existingParcel) {
         throw new BadRequestError(
            'You already have an active parcel on this trip.',
         );
      }

      // Цена за посылку: водитель мог указать parcel_price при создании
      // трипа; если нет — берём цену места
      const price = new Decimal(trip.parcel_price ?? trip.price_per_person);

      // Как у брони: INSTANT-трип подтверждает посылку сразу,
      // REQUEST — водитель отвечает через confirm/reject
      const initialStatus =
         trip.booking_type === BookingType.request
            ? ParcelStatus.PENDING
            : ParcelStatus.CONFIRMED;

      const newParcel = await parcelRepository.createParcel(
         {
            trip_id: tripId,
            sender_id: senderId,

            pickup_latitude,
            pickup_longitude,
            dropoff_latitude,
            dropoff_longitude,

            from_city: pickupGeo.cityName,
            to_city: dropoffGeo.cityName,
            from_address: pickupGeo.address,
            to_address: dropoffGeo.address,

            price: price.toNumber(),
            status: initialStatus,
         },
         t,
      );

      // Инвалидация кэша строго после commit: до него другой запрос
      // перечитал бы старые данные и закэшировал их заново; при
      // deadlock-retry afterCommit не срабатывает на откатах
      t.afterCommit(() => {
         clearParcelCaches(tripId, senderId, trip.driver_id);
      });

      return {
         parcel: formatParcelResponse(newParcel),
         _notif: {
            parcelId: newParcel.id,
            driverId: trip.driver_id,
            fromCity: pickupGeo.cityName,
            toCity: dropoffGeo.cityName,
            price: price.toString(),
            confirmed: initialStatus === ParcelStatus.CONFIRMED,
         },
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishParcelNotification({
      recipientId: senderId,
      eventType: 'created',
      metadata: {
         parcelId: _notif.parcelId,
         tripId,
         price: _notif.price,
      },
      translation: _notif.confirmed
         ? {
              key: 'notification.parcel.confirmed.sender',
              params: { price: _notif.price },
              titleKey: 'title.parcel.confirmed',
           }
         : {
              key: 'notification.parcel.created.sender',
              params: {
                 fromCity: _notif.fromCity,
                 toCity: _notif.toCity,
                 price: _notif.price,
              },
              titleKey: 'title.parcel.new_request',
           },
   }).catch((err) =>
      logger.error(
         { err, parcelId: _notif.parcelId },
         'Failed to send parcel notification to sender',
      ),
   );

   publishParcelNotification({
      recipientId: _notif.driverId,
      eventType: 'created',
      metadata: {
         parcelId: _notif.parcelId,
         tripId,
         price: _notif.price,
      },
      translation: {
         key: 'notification.parcel.created.driver',
         params: {
            fromCity: _notif.fromCity,
            toCity: _notif.toCity,
         },
         titleKey: 'title.parcel.new_request',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId: _notif.parcelId },
         'Failed to send parcel notification to driver',
      ),
   );

   return { parcel };
};

export const getMyParcels = async (senderId: string) => {
   const cacheKey = `user:parcels:${senderId}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const parcels = await parcelRepository.findParcelsBySender(senderId);
         return parcels.map(formatParcelResponse);
      },
      300, // TTL: 5 минут
   );
};

export const getParcelById = async (parcelId: string, userId: string) => {
   const parcel = await parcelRepository.findParcelByOptions({ id: parcelId });

   if (!parcel) {
      throw new NotFoundError('Parcel not found.');
   }

   // Детали посылки видят только отправитель и водитель трипа
   if (parcel.sender_id !== userId) {
      const trip = await tripRepository.findTripById(parcel.trip_id);
      if (!trip || trip.driver_id !== userId) {
         throw new NotFoundError('Parcel not found.');
      }
   }

   return formatParcelResponse(parcel);
};

export const getTripParcels = async (
   tripId: string,
   driverId: string,
   status?: string,
) => {
   const trip = await tripRepository.findTripByIdAndDriver(tripId, driverId);

   if (!trip) {
      throw new NotFoundError('Trip not found or you are not the driver');
   }

   const parcelStatus = status
      ? (status.toUpperCase() as ParcelStatus)
      : undefined;
   const parcels = await parcelRepository.findParcelsByTrip(
      tripId,
      parcelStatus,
   );

   return parcels.map(formatParcelResponse);
};

/**
 * Смена статуса водителем: confirm/reject (из PENDING), pickup (из
 * CONFIRMED — забрал посылку у отправителя), deliver (из PICKED_UP —
 * отдал получателю). Единый хелпер, т.к. проверки идентичны.
 */
const driverTransition = async (
   parcelId: string,
   driverId: string,
   fromStatuses: ParcelStatus[],
   toStatus: ParcelStatus,
   reason?: string,
) => {
   return withDeadlockRetry(async (t) => {
      const parcel = await parcelRepository.findParcelByOptions({
         id: parcelId,
         transaction: t,
         lock: true,
      });

      if (!parcel) {
         throw new NotFoundError('Parcel not found');
      }

      if (!fromStatuses.includes(parcel.status)) {
         throw new BadRequestError(
            `Cannot change parcel status from ${parcel.status} to ${toStatus}.`,
         );
      }

      const trip = await tripRepository.findTripById(parcel.trip_id, t);
      if (!trip) {
         throw new NotFoundError('Trip not found');
      }
      if (trip.driver_id !== driverId) {
         throw new ForbiddenError(
            'You are not authorized to manage this parcel',
         );
      }

      parcel.status = toStatus;
      if (reason !== undefined) {
         parcel.cancellation_reason = reason;
      }
      await parcelRepository.saveParcel(parcel, t);

      t.afterCommit(() => {
         clearParcelCaches(parcel.trip_id, parcel.sender_id, driverId);
      });

      return { parcel, trip };
   });
};

export const confirmParcel = async (parcelId: string, driverId: string) => {
   const { parcel } = await driverTransition(
      parcelId,
      driverId,
      [ParcelStatus.PENDING],
      ParcelStatus.CONFIRMED,
   );

   publishParcelNotification({
      recipientId: parcel.sender_id,
      eventType: 'confirmed',
      metadata: {
         parcelId: parcel.id,
         tripId: parcel.trip_id,
         price: String(parcel.price),
      },
      translation: {
         key: 'notification.parcel.confirmed.sender',
         params: { price: String(parcel.price) },
         titleKey: 'title.parcel.confirmed',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId },
         'Failed to send parcel confirmation notification to sender',
      ),
   );

   return {
      parcel: formatParcelResponse(parcel),
      message: 'Parcel confirmed successfully',
   };
};

export const rejectParcel = async (
   parcelId: string,
   driverId: string,
   reason?: string,
) => {
   const { parcel } = await driverTransition(
      parcelId,
      driverId,
      [ParcelStatus.PENDING],
      ParcelStatus.REJECTED,
      reason,
   );

   publishParcelNotification({
      recipientId: parcel.sender_id,
      eventType: 'rejected',
      metadata: {
         parcelId: parcel.id,
         tripId: parcel.trip_id,
      },
      translation: {
         key: 'notification.parcel.rejected.sender',
         params: { reason: reason ? ` Причина: ${reason}` : '' },
         titleKey: 'title.parcel.rejected',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId },
         'Failed to send parcel rejection notification to sender',
      ),
   );

   return {
      parcel: formatParcelResponse(parcel),
      message: 'Parcel rejected successfully',
   };
};

export const pickupParcel = async (parcelId: string, driverId: string) => {
   const { parcel } = await driverTransition(
      parcelId,
      driverId,
      [ParcelStatus.CONFIRMED],
      ParcelStatus.PICKED_UP,
   );

   publishParcelNotification({
      recipientId: parcel.sender_id,
      eventType: 'picked_up',
      metadata: {
         parcelId: parcel.id,
         tripId: parcel.trip_id,
      },
      translation: {
         key: 'notification.parcel.picked_up.sender',
         titleKey: 'title.parcel.picked_up',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId },
         'Failed to send parcel pickup notification to sender',
      ),
   );

   return {
      parcel: formatParcelResponse(parcel),
      message: 'Parcel marked as picked up',
   };
};

export const deliverParcel = async (parcelId: string, driverId: string) => {
   const { parcel } = await driverTransition(
      parcelId,
      driverId,
      [ParcelStatus.PICKED_UP],
      ParcelStatus.DELIVERED,
   );

   publishParcelNotification({
      recipientId: parcel.sender_id,
      eventType: 'delivered',
      metadata: {
         parcelId: parcel.id,
         tripId: parcel.trip_id,
      },
      translation: {
         key: 'notification.parcel.delivered.sender',
         titleKey: 'title.parcel.delivered',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId },
         'Failed to send parcel delivery notification to sender',
      ),
   );

   return {
      parcel: formatParcelResponse(parcel),
      message: 'Parcel marked as delivered',
   };
};

export const cancelParcel = async (
   parcelId: string,
   senderId: string,
   cancellationReason: string,
) => {
   const { formattedParcel, _notif } = await withDeadlockRetry(async (t) => {
      const parcel = await parcelRepository.findParcelByOptions({
         id: parcelId,
         sender_id: senderId,
         status: [ParcelStatus.PENDING, ParcelStatus.CONFIRMED],
         transaction: t,
         lock: true,
      });

      if (!parcel) {
         throw new NotFoundError(
            'Parcel not found, already cancelled, or you do not have permission to cancel it.',
         );
      }

      const trip = await tripRepository.findTripById(parcel.trip_id, t);
      if (!trip) {
         throw new NotFoundError('Trip not found for this parcel.');
      }

      await parcelRepository.cancelParcelWithReason(
         parcel.id,
         cancellationReason,
         t,
      );

      t.afterCommit(() => {
         clearParcelCaches(parcel.trip_id, senderId, trip.driver_id);
      });

      return {
         formattedParcel: formatParcelResponse(parcel),
         _notif: {
            parcelId: parcel.id,
            tripId: parcel.trip_id,
            driverId: trip.driver_id,
         },
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishParcelNotification({
      recipientId: senderId,
      eventType: 'cancelled',
      metadata: {
         parcelId: _notif.parcelId,
         tripId: _notif.tripId,
      },
      translation: {
         key: 'notification.parcel.cancelled.sender',
         params: {
            cancellationReason: cancellationReason
               ? ` Причина: ${cancellationReason}`
               : '',
         },
         titleKey: 'title.parcel.cancelled',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId: _notif.parcelId },
         'Failed to send parcel cancellation notification to sender',
      ),
   );

   publishParcelNotification({
      recipientId: _notif.driverId,
      eventType: 'cancelled',
      metadata: {
         parcelId: _notif.parcelId,
         tripId: _notif.tripId,
      },
      translation: {
         key: 'notification.parcel.cancelled.driver',
         titleKey: 'title.parcel.cancelled',
      },
   }).catch((err) =>
      logger.error(
         { err, parcelId: _notif.parcelId },
         'Failed to send parcel cancellation notification to driver',
      ),
   );

   return { parcel: formattedParcel };
};
