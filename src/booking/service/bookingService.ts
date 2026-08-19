import Booking, { BookingStatus } from '../models/Booking';

import * as bookingRepository from '../repository/bookingRepository';
import * as tripRepository from '../../trips/repository/tripRepository';
import * as userRepository from '../../user/repository/userRepository';

import * as promocodeRepository from '../../promocode/repository/promocodeRepository';
import { clearCache, getOrSetCache } from '../../../shared/config/redis';
import logger from '../../../shared/utils/logger';
import {
   BadRequestError,
   NotFoundError,
   ForbiddenError,
} from '../../../shared/utils/errorHandler';
import { Decimal } from 'decimal.js';
import { createBookDto } from '../models/dto/bookingCreateDto';
import { getGeoData } from '../../../shared/utils/geoData';
import { BookingType, TripStatus } from '../../trips/models/Trip';

import { publishBookingNotification } from '../../workers/queues/notificationQueue';
import { publishExternalDriverNotification } from '../../workers/queues/externalDriverQueue';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { getIO } from '../../../shared/config/socket';

/**
 * Дата и время выезда по Ташкенту (UTC+5, без DST) для сообщения внешнему
 * водителю в Telegram. Без даты водитель не поймёт, на какой рейс пришла бронь:
 * у регулярного водителя в выдаче висит до 7 одинаковых карточек на разные дни
 * (см. Trip Predictor).
 */
const formatDepartureUZT = (departureTs: Date | string): string => {
   const shifted = new Date(
      new Date(departureTs).getTime() + 5 * 60 * 60 * 1000,
   );
   const dd = String(shifted.getUTCDate()).padStart(2, '0');
   const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
   const hh = String(shifted.getUTCHours()).padStart(2, '0');
   const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
   return `${dd}.${mm} в ${hh}:${mi}`;
};

const formatBookingResponse = (booking: Booking) => {
   const bookingJson = booking.toJSON();

   const {
      pickup_latitude,
      pickup_longitude,
      dropoff_latitude,
      dropoff_longitude,
      from_city,
      to_city,
      from_address,
      to_address,
      totalPrice,
      ...rest
   } = bookingJson;

   return {
      ...rest,
      totalPrice: parseFloat(String(totalPrice)),
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

export const getMyBookings = async (userId: string) => {
   const cacheKey = `user:bookings:${userId}`;

   return getOrSetCache(
      cacheKey,
      async () => {
         const bookings = await bookingRepository.findBookingsByUserId(userId);
         return bookings.map(formatBookingResponse);
      },
      300, // TTL: 5 минут (бронирования могут меняться)
   );
};

export const createBooking = async (
   data: createBookDto,
   passengerId: string,
) => {
    const {
      tripId,
      pickup_latitude,
      pickup_longitude,
      dropoff_latitude,
      dropoff_longitude,
      seatsBooked,
   } = data;

   const [fromGeo, toGeo, tripPrecheck] = await Promise.all([
      getGeoData(pickup_longitude, pickup_latitude),
      getGeoData(dropoff_longitude, dropoff_latitude),
      tripRepository.findTripByIdWithLock(tripId),
   ]);

   if (!tripPrecheck) {
      throw new NotFoundError('Trip not found.');
   }

   if (tripPrecheck.booking_type === BookingType.request) {
      const { booking, summary, _notif } = await withDeadlockRetry(
         async (t) => {
            const trip = await tripRepository.findTripByIdWithLock(tripId, t);

            if (!trip) {
               throw new NotFoundError('Trip not found.');
            }
            if (trip.driver_id === passengerId) {
               throw new BadRequestError(
                  'Driver cannot book a seat in their own trip.',
               );
            }

            const blocked = await userRepository.isUserBlocked(
               passengerId,
               trip.driver_id,
            );
            if (blocked) {
               throw new ForbiddenError('You cannot book this trip.');
            }

            if (trip.seats_available < seatsBooked) {
               throw new BadRequestError('Not enough available seats.');
            }

            const existingBooking =
               await bookingRepository.findBookingExcludingStatuses(
                  tripId,
                  passengerId,
                  [
                     BookingStatus.CANCELLED,
                     BookingStatus.FAILED,
                     BookingStatus.REJECTED,
                  ],
                  t,
               );

            if (existingBooking) {
               throw new BadRequestError(
                  'You have already booked a seat on this trip.',
               );
            }

            const basePrice = new Decimal(trip.price_per_person).mul(
               seatsBooked,
            );

            // Для REQUEST бронирований промокод НЕ применяется сейчас.
            // Промокод будет применен в confirmBooking когда водитель подтвердит.
            // Это предотвращает потерю промокода если водитель отклонит запрос.
            const finalBasePrice = basePrice;

            const bookingForRepo = {
               tripId: tripId,
               passengerId: passengerId,
               seatsBooked: seatsBooked,

               pickup_latitude: pickup_latitude,
               pickup_longitude: pickup_longitude,
               dropoff_latitude: dropoff_latitude,
               dropoff_longitude: dropoff_longitude,

               from_address: fromGeo.address,
               to_address: toGeo.address,

               from_city: fromGeo.cityName,
               to_city: toGeo.cityName,

               totalPrice: finalBasePrice.toNumber(),
               status: BookingStatus.PENDING,
            };

            const newBooking = await bookingRepository.createBooking(
               bookingForRepo,
               t,
            );

            // Инвалидация кэша строго после commit: до него другой запрос
            // перечитал бы старые данные и закэшировал их заново; при
            // deadlock-retry afterCommit не срабатывает на откатах
                t.afterCommit(() => {
                   Promise.all([
                      clearCache(`trip:details:${tripId}:*`),
                      clearCache('trip:search:*'),
                      clearCache(`user:activity:${passengerId}:*`),
                      clearCache(`user:activity:${trip.driver_id}:*`),
                      clearCache(`user:bookings:${passengerId}`),
                      clearCache(`user:profile:${passengerId}`),
                   ]).catch((err) =>
                      logger.warn({ err }, 'Cache invalidation failed'),
                   );
                });

             return {
               booking: formatBookingResponse(newBooking),
               summary: {
                  seatsBooked,
                  basePrice: basePrice.toNumber(),
                  discountApplied: false, // Промокод не применяется для REQUEST до подтверждения
                  totalPrice: finalBasePrice.toNumber(),
               },
               _notif: {
                  bookingId: newBooking.id,
                  driverId: trip.driver_id,
                  finalBasePrice: finalBasePrice.toString(),
                  fromCity: trip.from_city,
                  toCity: trip.to_city,
                  pricePerPerson: Number(trip.price_per_person),
                  departureTs: trip.departure_ts,
               },
            };
         },
      );

      // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
      publishBookingNotification({
         recipientId: passengerId,
         eventType: 'created',
         metadata: {
            bookingId: _notif.bookingId,
            tripId: tripId,
            seatCount: seatsBooked,
            totalPrice: _notif.finalBasePrice,
         },
         translation: {
            key: 'notification.booking.created.passenger',
            params: {
               seatsBooked: seatsBooked.toString(),
               totalPrice: _notif.finalBasePrice,
            },
            titleKey: 'title.booking.new_passenger',
         },
      }).catch((err) =>
         logger.error(
            { err, bookingId: _notif.bookingId },
            'Failed to send notification to passenger',
         ),
      );

      publishBookingNotification({
         recipientId: _notif.driverId,
         eventType: 'created',
         metadata: {
            bookingId: _notif.bookingId,
            tripId: tripId,
            seatCount: seatsBooked,
         },
         translation: {
            key: 'notification.booking.created.driver',
            params: {
               seatsBooked: seatsBooked.toString(),
            },
            titleKey: 'title.booking.new_passenger',
         },
      }).catch((err) =>
         logger.error(
            { err, bookingId: _notif.bookingId },
            'Failed to send notification to driver',
         ),
      );

      userRepository
         .findUserByIdProfile(passengerId)
         .then((passenger) => {
            getIO()
               .to(_notif.driverId)
               .emit('new_booking', {
                  booking: {
                     ...booking,
                     status: BookingStatus.PENDING,
                  },
                  passenger: passenger
                     ? {
                          id: passenger.id,
                          firstName: passenger.firstName,
                          lastName: passenger.lastName,
                          avatar: passenger.avatar,
                          rating: passenger.rating,
                       }
                     : null,
               });
         })
         .catch((err) => {
            logger.warn(
               { err, bookingId: _notif.bookingId },
               'Failed to emit new_booking socket event to driver',
            );
         });

      // Если водитель внешний (импортирован через парсер) —
      // отправляем уведомление через Telegram (Python worker читает очередь).
      // Симметрично INSTANT-флоу: для REQUEST водитель тоже должен получить
      // ивент в очередь, иначе внешний водитель не узнает о новой брони.
      userRepository
         .findUserById(_notif.driverId)
         .then(async (driver) => {
            if (driver) {
               await publishExternalDriverNotification({
                  event: 'driver.notification',
                  data: {
                     trip_id: tripId,
                     booking_id: _notif.bookingId,
                     driver_phone: driver.phoneNumber,
                     driver_name: driver.firstName,
                     from_city: _notif.fromCity,
                     to_city: _notif.toCity,
                     price: _notif.pricePerPerson,
                     passenger_id: passengerId,
                     departure_ts: new Date(_notif.departureTs).toISOString(),
                     message: `Новый запрос на бронирование: ${seatsBooked} место(а) на рейсе ${_notif.fromCity} → ${_notif.toCity} ${formatDepartureUZT(_notif.departureTs)}. Цена: ${_notif.pricePerPerson} сум/чел`,
                  },
               });
            }
         })
         .catch((err) =>
            logger.error(
               { err, driverId: _notif.driverId, bookingId: _notif.bookingId },
               'Failed to check/notify external driver via Telegram',
            ),
         );
      return { booking, summary };
   }
   const { booking, summary, _notif } = await withDeadlockRetry(async (t) => {
      const trip = await tripRepository.findTripByIdWithLock(tripId, t);

      if (!trip) {
         throw new NotFoundError('Trip not found.');
      }
      if (trip.driver_id === passengerId) {
         throw new BadRequestError(
            'Driver cannot book a seat in their own trip.',
         );
      }

      const blocked = await userRepository.isUserBlocked(
         passengerId,
         trip.driver_id,
      );
      if (blocked) {
         throw new ForbiddenError('You cannot book this trip.');
      }

      // Проверка мест после блокировки (FOR UPDATE уже применен в findTripByIdWithLock)
      if (trip.seats_available < seatsBooked) {
         throw new BadRequestError('Not enough available seats.');
      }

      const existingBooking =
         await bookingRepository.findBookingExcludingStatuses(
            tripId,
            passengerId,
            [
               BookingStatus.CANCELLED,
               BookingStatus.FAILED,
               BookingStatus.REJECTED,
            ],
            t,
         );

      if (existingBooking) {
         throw new BadRequestError(
            'You have already booked a seat on this trip.',
         );
      }

      const basePrice = new Decimal(trip.price_per_person).mul(seatsBooked);

      let discountApplied = false;
      let finalBasePrice = basePrice;
      let usedPromoCodeId: string | null = null;

      const userPromoCode = await promocodeRepository.findByUserId(
         passengerId,
         t,
      );
      if (userPromoCode && userPromoCode.isActive) {
         const discountPercentage = new Decimal(
            userPromoCode.discountPercentage,
         ).div(100);
         const discountAmount = basePrice.mul(discountPercentage);
         finalBasePrice = basePrice.minus(discountAmount);

         discountApplied = true;
         usedPromoCodeId = userPromoCode.id;
      }

      const bookingForRepo = {
         tripId: tripId,
         passengerId: passengerId,
         seatsBooked: seatsBooked,

         pickup_latitude: pickup_latitude,
         pickup_longitude: pickup_longitude,
         dropoff_latitude: dropoff_latitude,
         dropoff_longitude: dropoff_longitude,

         from_address: fromGeo.address,
         to_address: toGeo.address,

         from_city: fromGeo.cityName,
         to_city: toGeo.cityName,

         totalPrice: finalBasePrice.toNumber(),
         status: BookingStatus.CONFIRMED,
      };

      const newBooking = await bookingRepository.createBooking(
         bookingForRepo,
         t,
      );

      // SEQ-1: trip.update() вместо trip.save() — обновляем только нужное поле,
      // не рискуем перезаписать изменения из параллельных транзакций
      await tripRepository.updateTripSeatsAvailable(
         trip,
         trip.seats_available - seatsBooked,
         t,
      );

      if (discountApplied && usedPromoCodeId) {
         await promocodeRepository.markPromoCodeAsUsed(usedPromoCodeId, t);
      }

      // withDeadlockRetry автоматически выполнит commit, не нужно вручную

      // Инвалидация кэша строго после commit: до него другой запрос
      // перечитал бы старые данные и закэшировал их заново; при
      // deadlock-retry afterCommit не срабатывает на откатах
      t.afterCommit(() => {
         Promise.all([
            clearCache(`trip:details:${tripId}:*`),
            clearCache('trip:search:*'),
            clearCache(`user:activity:${passengerId}:*`),
            clearCache(`user:activity:${trip.driver_id}:*`),
            clearCache(`user:bookings:${passengerId}`),
            clearCache(`user:profile:${passengerId}`),
         ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));
      });

      return {
         booking: formatBookingResponse(newBooking),
         summary: {
            seatsBooked,
            basePrice: basePrice.toNumber(),
            discountApplied,
            totalPrice: finalBasePrice.toNumber(),
         },
         _notif: {
            bookingId: newBooking.id,
            driverId: trip.driver_id,
            finalBasePrice: finalBasePrice.toString(),
            fromCity: trip.from_city,
            toCity: trip.to_city,
            pricePerPerson: Number(trip.price_per_person),
            departureTs: trip.departure_ts,
         },
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishBookingNotification({
      recipientId: passengerId,
      eventType: 'created',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: tripId,
         seatCount: seatsBooked,
         totalPrice: _notif.finalBasePrice,
      },
      translation: {
         key: 'notification.booking.created.passenger',
         params: {
            seatsBooked: seatsBooked.toString(),
            totalPrice: _notif.finalBasePrice,
         },
         titleKey: 'title.booking.confirmed',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send notification to passenger',
      ),
   );

   publishBookingNotification({
      recipientId: _notif.driverId,
      eventType: 'created',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: tripId,
         seatCount: seatsBooked,
      },
      translation: {
         key: 'notification.booking.created.driver',
         params: {
            seatsBooked: seatsBooked.toString(),
         },
         titleKey: 'title.booking.new_passenger',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send notification to driver',
      ),
   );

   // Если водитель внешний (импортирован через парсер) —
   // отправляем уведомление через Telegram (Python worker читает очередь)
   userRepository
      .findUserById(_notif.driverId)
      .then(async (driver) => {
         if (driver) {
            await publishExternalDriverNotification({
               event: 'driver.notification',
               data: {
                  trip_id: tripId,
                  booking_id: _notif.bookingId,
                  driver_phone: driver.phoneNumber,
                  driver_name: driver.firstName,
                  from_city: _notif.fromCity,
                  to_city: _notif.toCity,
                  price: _notif.pricePerPerson,
                  passenger_id: passengerId,
                  departure_ts: new Date(_notif.departureTs).toISOString(),
                  message: `Новое бронирование: ${seatsBooked} место(а) на рейсе ${_notif.fromCity} → ${_notif.toCity} ${formatDepartureUZT(_notif.departureTs)}. Цена: ${_notif.pricePerPerson} сум/чел`,
               },
            });
         }
      })
      .catch((err) =>
         logger.error(
            { err, driverId: _notif.driverId, bookingId: _notif.bookingId },
            'Failed to check/notify external driver via Telegram',
         ),
      );

   return { booking, summary };
};

export const cancelBooking = async (
   bookingId: string,
   userId: string,
   cancellationReason: string,
) => {
   const { formattedBooking, _notif } = await withDeadlockRetry(async (t) => {
      const booking = await bookingRepository.findBookingWithTripDetails({
         id: bookingId,
         passengerId: userId,
         status: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
         transaction: t,
         lock: true,
      });

      if (!booking) {
         throw new NotFoundError(
            'Booking not found, already cancelled, or you do not have permission to cancel it.',
         );
      }

      // FUTURE
      // const originalTransaction =
      //    await transactionRepository.findTransactionByBooking(bookingId, t);
      // if (!originalTransaction) {
      //    throw new NotFoundError(
      //       'Original transaction not found for this booking.',
      //    );
      // }

      // let refundDetails: any;
      //
      // const refundAmount = new Decimal(originalTransaction.amount).negated();
      //
      // if (originalTransaction.walletId) {
      //    const wallet = await walletRepository.findWalletWithLock(
      //       originalTransaction.walletId,
      //       t,
      //    );
      //    await walletRepository.changeWalletBalance(wallet, refundAmount, t);
      //    refundDetails = { type: 'WALLET' };
      // } else {
      //    logger.info({ bookingId }, 'Refunding to card via ipak.');
      //    const reverseResult = await paymentService.reversePayment(
      //       booking.id,
      //       t,
      //    );
      //    refundDetails = {
      //       type: 'CARD',
      //       providerId: reverseResult.response.transfer_id,
      //    };
      // }

      // const refundTransaction = await transactionRepository.createTransaction(
      //    {
      //       walletId: originalTransaction.walletId,
      //       type: TransactionType.REFUND,
      //       amount: refundAmount.toNumber(),
      //       status: TransactionStatus.COMPLETED,
      //       description: `Refund for booking cancellation #${booking.id.substring(0, 8)}`,
      //       relatedEntityId: booking.id,
      //       relatedEntityType: 'booking',
      //    },
      //    t,
      // );
      //
      // refundDetails.transaction = refundTransaction.toJSON();

      const trip = await tripRepository.findTripByIdWithLock(booking.tripId, t);
      if (!trip) {
         throw new NotFoundError('Trip not found for this booking.');
      }
      if (trip.status === TripStatus.InProgress) {
         throw new BadRequestError(
            `Cannot cancel booking with trip status "${trip.status}".`,
         );
      }
      await tripRepository.updateTripSeatsAvailable(
         trip,
         trip.seats_available + booking.seatsBooked,
         t,
      );

      // Пассажир сам отменяет свою бронь → всегда CANCELLED (для обоих типов).
      // REJECTED ставится только когда ВОДИТЕЛЬ отклоняет request (rejectBooking).
      await bookingRepository.cancelBookingWithReason(
         booking.id,
         cancellationReason,
         t,
         BookingStatus.CANCELLED,
      );

      // Инвалидация кэша строго после commit: до него другой запрос
      // перечитал бы старые данные и закэшировал их заново; при
      // deadlock-retry afterCommit не срабатывает на откатах
      t.afterCommit(() => {
         Promise.all([
            clearCache(`trip:details:${booking.tripId}:*`),
            clearCache('trip:search:*'),
            clearCache(`user:activity:${userId}:*`),
            clearCache(`user:activity:${trip.driver_id}:*`),
            clearCache(`user:bookings:${userId}`),
            clearCache(`user:bookings:${trip.driver_id}`),
         ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));
      });

      return {
         formattedBooking: formatBookingResponse(booking),
         _notif: {
            bookingId: booking.id,
            tripId: booking.tripId,
            passengerId: userId,
            driverId: (booking as any).trip.driver_id,
         },
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishBookingNotification({
      recipientId: _notif.passengerId,
      eventType: 'cancelled',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
      },
      translation: {
         key: 'notification.booking.cancelled.passenger',
         params: {
            cancellationReason: cancellationReason
               ? ` Причина: ${cancellationReason}`
               : '',
         },
         titleKey: 'title.booking.cancelled',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send cancellation notification to passenger',
      ),
   );

   publishBookingNotification({
      recipientId: _notif.driverId,
      eventType: 'cancelled',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
      },
      translation: {
         key: 'notification.booking.cancelled.driver',
         titleKey: 'title.booking.cancelled',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send cancellation notification to driver',
      ),
   );

   return { booking: formattedBooking };
};

export const updateBooking = async (
   bookingId: string,
   userId: string,
   seatsBooked: number,
) => {
   const { formattedBooking, summary, _notif } = await withDeadlockRetry(
      async (t) => {
         const booking = await bookingRepository.findBookingWithTripDetails({
            id: bookingId,
            passengerId: userId,
            status: BookingStatus.CONFIRMED,
            transaction: t,
            lock: true,
         });

         if (!booking) {
            throw new NotFoundError(
               'Booking not found, already cancelled, or you do not have permission to update it.',
            );
         }

         const trip = await tripRepository.findTripByIdWithLock(
            booking.tripId,
            t,
         );
         if (!trip) {
            throw new NotFoundError('Trip not found for this booking.');
         }
         if (trip.status === TripStatus.InProgress) {
            throw new BadRequestError(
               `Cannot update booking with trip status "${trip.status}".`,
            );
         }

         if (seatsBooked === booking.seatsBooked) {
            throw new BadRequestError(
               'New seat count is the same as current. No update needed.',
            );
         }

         const seatsDifference = seatsBooked - booking.seatsBooked;

         if (seatsDifference > 0 && trip.seats_available < seatsDifference) {
            throw new BadRequestError(
               `Not enough seats available. You need ${seatsDifference} more seats, but only ${trip.seats_available} available.`,
            );
         }

         // BL-8: используем исходную ставку за место из текущего бронирования.
         // Это предотвращает повторное применение промокода при обновлении и одновременно
         // сохраняет изначально применённую скидку.
         const originalPricePerSeat = new Decimal(booking.totalPrice).div(
            booking.seatsBooked,
         );
         const finalPrice = originalPricePerSeat
            .mul(seatsBooked)
            .toDecimalPlaces(2);

         await tripRepository.updateTripSeatsAvailable(
            trip,
            trip.seats_available - seatsDifference,
            t,
         );

         booking.seatsBooked = seatsBooked;
         booking.totalPrice = finalPrice.toNumber();
         await bookingRepository.saveBooking(booking, t);

         const seatChangeText =
            seatsDifference > 0
               ? `увеличено на ${seatsDifference}`
               : `уменьшено на ${Math.abs(seatsDifference)}`;

         // Инвалидация кэша строго после commit: до него другой запрос
         // перечитал бы старые данные и закэшировал их заново; при
         // deadlock-retry afterCommit не срабатывает на откатах
         t.afterCommit(() => {
            Promise.all([
               clearCache(`trip:details:${booking.tripId}:*`),
               clearCache('trip:search:*'),
               clearCache(`user:activity:${userId}:*`),
               clearCache(`user:activity:${trip.driver_id}:*`),
               clearCache(`user:bookings:${userId}`),
            ]).catch((err) =>
               logger.warn({ err }, 'Cache invalidation failed'),
            );
         });

         return {
            formattedBooking: formatBookingResponse(booking),
            summary: {
               oldSeats: booking.seatsBooked - seatsDifference,
               newSeats: seatsBooked,
               seatsDifference,
               totalPrice: finalPrice.toNumber(),
            },
            _notif: {
               bookingId: booking.id,
               tripId: booking.tripId,
               driverId: (booking as any).trip.driver_id,
               finalPrice: finalPrice.toString(),
               seatChangeText,
            },
         };
      },
   );

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishBookingNotification({
      recipientId: userId,
      eventType: 'updated',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
         seatCount: seatsBooked,
         totalPrice: _notif.finalPrice,
      },
      translation: {
         key: 'notification.booking.updated.passenger',
         params: {
            seatsDifference: `количество мест ${_notif.seatChangeText}. Новая стоимость: ${_notif.finalPrice} сум`,
         },
         titleKey: 'title.booking.updated',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send updated notification to passenger',
      ),
   );

   publishBookingNotification({
      recipientId: _notif.driverId,
      eventType: 'updated',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
         seatCount: seatsBooked,
      },
      translation: {
         key: 'notification.booking.updated.driver',
         params: {
            seatChangeText: _notif.seatChangeText,
         },
         titleKey: 'title.booking.updated',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send updated notification to driver',
      ),
   );

   return { booking: formattedBooking, summary };
};

export const getBookingForDriver = async (
   bookingId: string,
   driverId: string,
) => {
   const existBooking = await bookingRepository.findBookingForDriver(
      bookingId,
      driverId,
   );

   if (!existBooking) {
      throw new NotFoundError('Booking not found');
   }
   return formatBookingResponse(existBooking);
};

export const getBookingById = async (bookingId: string, userId: string) => {
   const existBooking = await bookingRepository.findBookingByOptions({
      id: bookingId,
      passengerId: userId,
   });

   if (!existBooking) {
      throw new NotFoundError('Booking not found');
   }
   return existBooking;
};

export const confirmBooking = async (bookingId: string, driverId: string) => {
   const { formattedBooking, message, promoCodeApplied, finalPrice, _notif } =
      await withDeadlockRetry(async (t) => {
         const booking = await bookingRepository.findBookingByOptions({
            id: bookingId,
            transaction: t,
            lock: true,
         });

         if (!booking) {
            throw new NotFoundError('Booking not found');
         }

         if (booking.status !== BookingStatus.PENDING) {
            throw new BadRequestError(
               `Cannot confirm booking with status ${booking.status}. Only PENDING bookings can be confirmed.`,
            );
         }

         const trip = await tripRepository.findTripByIdWithLock(
            booking.tripId,
            t,
         );

         if (!trip) {
            throw new NotFoundError('Trip not found');
         }

         if (trip.driver_id !== driverId) {
            throw new ForbiddenError(
               'You are not authorized to confirm this booking',
            );
         }

         const blocked = await userRepository.isUserBlocked(
            driverId,
            booking.passengerId,
         );
         if (blocked) {
            throw new ForbiddenError('You cannot confirm this booking.');
         }

         if (trip.seats_available < booking.seatsBooked) {
            throw new BadRequestError(
               'Not enough available seats to confirm this booking',
            );
         }

         let finalPrice = booking.totalPrice;
         let promoCodeApplied = false;
         const userPromoCode = await promocodeRepository.findByUserId(
            booking.passengerId,
            t,
         );
         if (userPromoCode && userPromoCode.isActive) {
            const basePrice = new Decimal(trip.price_per_person).mul(
               booking.seatsBooked,
            );
            const discountPercentage = new Decimal(
               userPromoCode.discountPercentage,
            ).div(100);
            const discountAmount = basePrice.mul(discountPercentage);
            finalPrice = basePrice.minus(discountAmount).toNumber();

            booking.totalPrice = finalPrice;

            await promocodeRepository.markPromoCodeAsUsed(userPromoCode.id, t);
            promoCodeApplied = true;
         }

         // SEQ-1: trip.update() вместо trip.save()
         await tripRepository.updateTripSeatsAvailable(
            trip,
            trip.seats_available - booking.seatsBooked,
            t,
         );

         booking.status = BookingStatus.CONFIRMED;
         await bookingRepository.saveBooking(booking, t);

         // Инвалидация кэша строго после commit: до него другой запрос
         // перечитал бы старые данные и закэшировал их заново; при
         // deadlock-retry afterCommit не срабатывает на откатах
         t.afterCommit(() => {
            Promise.all([
               clearCache(`trip:details:${trip.id}:*`),
               clearCache('trip:search:*'),
               clearCache(`user:bookings:${booking.passengerId}`),
               clearCache(`user:activity:${booking.passengerId}:*`),
               clearCache(`user:activity:${driverId}:*`),
            ]).catch((err) =>
               logger.warn({ err }, 'Cache invalidation failed'),
            );
         });

         return {
            formattedBooking: formatBookingResponse(booking),
            message: 'Booking confirmed successfully',
            promoCodeApplied,
            finalPrice,
            _notif: {
               passengerId: booking.passengerId,
               bookingId: booking.id,
               tripId: trip.id,
               seatsBooked: booking.seatsBooked,
            },
         };
      });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishBookingNotification({
      recipientId: _notif.passengerId,
      eventType: 'confirmed',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
         seatCount: _notif.seatsBooked,
         totalPrice: finalPrice.toString(),
      },
      translation: {
         key: 'notification.booking.confirmed.passenger',
         params: {
            seatsBooked: _notif.seatsBooked.toString(),
            totalPrice: finalPrice.toString(),
         },
         titleKey: 'title.booking.confirmed',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send confirmation notification to passenger',
      ),
   );

   return { booking: formattedBooking, message, promoCodeApplied, finalPrice };
};

export const rejectBooking = async (
   bookingId: string,
   driverId: string,
   reason?: string,
) => {
   const { formattedBooking, _notif } = await withDeadlockRetry(async (t) => {
      const booking = await bookingRepository.findBookingByOptions({
         id: bookingId,
         transaction: t,
         lock: true,
      });

      if (!booking) {
         throw new NotFoundError('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
         throw new BadRequestError(
            `Cannot reject booking with status ${booking.status}. Only PENDING bookings can be rejected.`,
         );
      }

      const trip = await tripRepository.findTripByIdWithLock(booking.tripId, t);

      if (!trip) {
         throw new NotFoundError('Trip not found');
      }

      if (trip.driver_id !== driverId) {
         throw new ForbiddenError(
            'You are not authorized to reject this booking',
         );
      }

      booking.status = BookingStatus.REJECTED;
      await bookingRepository.saveBooking(booking, t);

      // Инвалидация кэша строго после commit: до него другой запрос
      // перечитал бы старые данные и закэшировал их заново; при
      // deadlock-retry afterCommit не срабатывает на откатах
      t.afterCommit(() => {
         Promise.all([
            clearCache(`trip:details:${trip.id}:*`),
            clearCache('trip:search:*'),
            clearCache(`user:bookings:${booking.passengerId}`),
            clearCache(`user:activity:${booking.passengerId}:*`),
            clearCache(`user:activity:${driverId}:*`),
         ]).catch((err) => logger.warn({ err }, 'Cache invalidation failed'));
      });

      return {
         formattedBooking: formatBookingResponse(booking),
         _notif: {
            passengerId: booking.passengerId,
            bookingId: booking.id,
            tripId: trip.id,
         },
      };
   });

   // Уведомления отправляем ПОСЛЕ успешного commit — не дублируются при retry
   publishBookingNotification({
      recipientId: _notif.passengerId,
      eventType: 'cancelled',
      metadata: {
         bookingId: _notif.bookingId,
         tripId: _notif.tripId,
      },
      translation: {
         key: 'notification.booking.cancelled.passenger',
         params: {
            cancellationReason: reason || 'Driver declined the request',
         },
         titleKey: 'title.booking.cancelled',
      },
   }).catch((err) =>
      logger.error(
         { err, bookingId: _notif.bookingId },
         'Failed to send rejection notification to passenger',
      ),
   );

   return {
      booking: formattedBooking,
      message: 'Booking rejected successfully',
   };
};
