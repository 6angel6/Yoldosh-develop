import { Trip, TripStatus } from '../models/Trip';
import { BookingStatus } from '../../booking/models/Booking';
import * as tripRepository from '../repository/tripRepository';
import * as bookingRepository from '../../booking/repository/bookingRepository';
import * as userRepository from '../../user/repository/userRepository';
import * as transactionRepository from '../../payment/repository/transactionRepository';
import * as walletRepository from '../../payment/repository/walletRepository';
import * as promocodeRepository from '../../promocode/repository/promocodeRepository';
import { NavigatorPreference } from '../../user/models/User';
import { generateAllRouteLinks } from '../../../shared/utils/navigationLinks';
import { Decimal } from 'decimal.js';
import {
    TransactionStatus,
    TransactionType,
} from '../../payment/models/Transaction';
import {
    BadRequestError,
    InternalServerError,
    NotFoundError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import { getCurrentTimeUTC } from '../../../shared/utils/timeUtils';
import logger from '../../../shared/utils/logger';
import { formatTripResponse } from './tripFormatterService';
import { clearCache } from '../../../shared/config/redis';
import {
    calculateCommission,
    COMMISSION_CONFIG,
} from '../../../shared/config/commission';
import {
    publishParcelNotification,
    publishTripNotification,
    publishWalletNotification,
} from '../../workers/queues/notificationQueue';
import * as parcelRepository from '../../parcel/repository/parcelRepository';
import Parcel, { ParcelStatus } from '../../parcel/models/Parcel';
import { findAllBookingsByStatus } from '../../booking/repository/bookingRepository';
import { Transaction } from 'sequelize';
import { tripStateMachine, TripTransitionEvent } from './tripStateMachine';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import { getIO } from '../../../shared/config/socket';

/**
 * Единая точка рассылки события об изменении статуса трипа по WebSocket.
 * Дублирует REST-ответ (/my-activity) в реальном времени: клиент, у которого
 * открыт экран истории поездок, получает обновлённый статус трипа без
 * перезапроса списка и без ожидания истечения кэша (TTL 5 минут).
 *
 * Комнаты — это userId (та же схема, что уже используется для 'new_booking'
 * в bookingRepository: getIO().to(driverId).emit(...)).
 */
const emitTripStatusUpdate = (
    trip: Trip,
    recipientIds: string[],
) => {
    const payload = {
        tripId: trip.id,
        status: trip.status,
        trip: formatTripResponse(trip, null),
        updatedAt: new Date().toISOString(),
    };

    const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))];

    for (const recipientId of uniqueRecipients) {
        try {
            getIO().to(recipientId).emit('trip_status_updated', payload);
        } catch (err) {
            logger.warn(
                { err, tripId: trip.id, recipientId },
                'Failed to emit trip_status_updated socket event',
            );
        }
    }
};

export const startTrip = async (tripId: string, driverId: string) => {
    const { result, bookings, updatedTrip, trip } = await withDeadlockRetry(
        async (t) => {
            const [trip, driver] = await Promise.all([
                tripRepository.findTripByIdAndDriver(tripId, driverId, t, true),
                userRepository.findUserByIdWithWallet(driverId, t),
            ]);

            if (!trip) {
                throw new NotFoundError('Trip not found');
            }
            if (!driver) {
                throw new NotFoundError('Driver not found');
            }

            const newStatus = await tripStateMachine.transition(
                trip.status,
                TripTransitionEvent.START_TRIP,
                {
                    tripId: trip.id,
                    driverId: driver.id,
                    metadata: {
                        departure_ts: trip.departure_ts,
                    },
                },
            );

            if (driver.preferred_navigator === NavigatorPreference.None) {
                throw new BadRequestError('Navigator not selected');
            }

            if (
                !driver.wallet ||
                driver.wallet.balance < COMMISSION_CONFIG.MIN_DRIVER_BALANCE
            ) {
                throw new BadRequestError(
                    `Cannot start trip: your balance is below the minimum allowed (${COMMISSION_CONFIG.MIN_DRIVER_BALANCE} sum). Please top up your wallet. Current balance: ${driver.wallet?.balance || 0} sum.`,
                );
            }

            const [totalBookings, confirmedBookings] = await Promise.all([
                bookingRepository.countActiveBookings(trip.id, t),
                bookingRepository.countConfirmedBookings(trip.id, t),
            ]);

            if (totalBookings > 0 && totalBookings !== confirmedBookings) {
                throw new BadRequestError('Not all bookings are confirmed');
            }

            const updatedTrip = await tripRepository.updateTrip(
                trip,
                {
                    status: newStatus,
                    trip_start_ts: getCurrentTimeUTC(),
                },
                t,
            );

            const bookings = await findAllBookingsByStatus(
                tripId,
                BookingStatus.CONFIRMED,
                t,
            );

            const startPoint = {
                lat: trip.from_latitude,
                lon: trip.from_longitude,
            };

            const pickups = bookings.map((b) => ({
                lat: parseFloat(String(b.pickup_latitude)),
                lon: parseFloat(String(b.pickup_longitude)),
            }));

            const dropoffs = bookings.map((b) => ({
                lat: parseFloat(String(b.dropoff_latitude)),
                lon: parseFloat(String(b.dropoff_longitude)),
            }));

            const optimizedPickups = optimizeRoute(startPoint, pickups);
            const lastPickup =
                optimizedPickups[optimizedPickups.length - 1] || startPoint;
            const optimizedDropoffs = optimizeRoute(lastPickup, dropoffs);

            // Если нет CONFIRMED-броней (типичный кейс для REQUEST-трипов, когда
            // водитель стартует без принятых заявок) — маршрут просто from → to,
            // иначе generateAllRouteLinks упадёт на проверке "at least 2 points".
            const finalRoute =
                bookings.length > 0
                    ? [startPoint, ...optimizedPickups, ...optimizedDropoffs]
                    : [
                        startPoint,
                        {
                            lat: trip.to_latitude,
                            lon: trip.to_longitude,
                        },
                    ];

            const routeLinks = generateAllRouteLinks(finalRoute);
            const preferredLink = routeLinks[driver.preferred_navigator];

            // Инвалидация кэша строго после commit: до него другой запрос перечитал
            // бы старые данные и закэшировал их заново; при deadlock-retry
            // afterCommit не срабатывает на откатах
            t.afterCommit(() => {
                Promise.all([
                    clearCache(`trip:details:${tripId}:*`),
                    clearCache('trip:search:*'),
                    clearCache(`user:activity:${driverId}:*`),
                ]).catch((err) =>
                    logger.warn({ err }, 'Cache invalidation failed'),
                );

                // WS: статус трипа сменился на IN_PROGRESS — уведомляем водителя
                // и всех подтверждённых пассажиров сразу, до прихода push/queue.
                emitTripStatusUpdate(updatedTrip, [
                    driverId,
                    ...bookings.map((b) => b.passengerId),
                ]);
            });

            return {
                trip,
                updatedTrip,
                bookings,
                result: {
                    trip: formatTripResponse(updatedTrip, null),
                    navigation: {
                        preferred_navigator: driver.preferred_navigator,
                        link_to_open: preferredLink.link,
                        app_meta_data: preferredLink.app_data,
                    },
                },
            };
        },
    );

    // Уведомления отправляем ПОСЛЕ успешного commit транзакции — ровно 1 раз
    logger.info(
        { tripId, passengerCount: bookings.length },
        'Sending start notifications to passengers',
    );

    await Promise.all(
        bookings.map((booking) =>
            publishTripNotification({
                recipientId: booking.passengerId,
                eventType: 'start_trip',
                metadata: {
                    tripId: tripId,
                    status: updatedTrip.status,
                    driverId: driverId,
                    passengerId: booking.passengerId,
                },
                translation: {
                    key: 'notification.trip.started.passenger',
                    params: {
                        fromCity: booking.from_city,
                        toCity: booking.to_city,
                    },
                    titleKey: 'title.trip.started',
                },
            }).catch((err) =>
                logger.error(
                    { err, tripId: tripId, passengerId: booking.passengerId },
                    'Failed to start trip notification to passenger',
                ),
            ),
        ),
    );

    publishTripNotification({
        recipientId: driverId,
        eventType: 'start_trip',
        metadata: {
            tripId: updatedTrip.id,
            status: updatedTrip.status,
            driverId: driverId,
        },
        translation: {
            key: 'notification.trip.started.driver',
            params: {
                fromCity: trip.from_city,
                toCity: trip.to_city,
            },
            titleKey: 'title.trip.started',
        },
    }).catch((err) =>
        logger.error(
            { err, tripId: updatedTrip.id },
            'Failed to start trip notification to driver',
        ),
    );

    logger.info(
        { tripId, driverId, passengerCount: bookings.length },
        'Sent start trip notifications to all passengers',
    );

    return result;
};

export const chargeDriverForTripCommission = async (
    trip: Trip,
    t: Transaction,
) => {
    const driver = await userRepository.findUserByIdWithWallet(
        trip.driver_id,
        t,
    );
    if (!driver || !driver.wallet) {
        throw new NotFoundError('Driver wallet not found');
    }

    // Пока поездки бесплатные — комиссия не списывается и транзакция не создаётся
    if (COMMISSION_CONFIG.TRIP_COMMISSION_PERCENTAGE === 0) {
        return { wallet: driver.wallet, commissionAmount: 0 };
    }

    const confirmedBookings = await bookingRepository.findAllBookings(
        trip.id,
        t,
    );

    const totalTripRevenue = confirmedBookings.reduce(
        (sum, booking) => sum + Number(booking.totalPrice),
        0,
    );

    const commissionAmount = calculateCommission(totalTripRevenue);

    const driverWallet = await walletRepository.findWalletWithLock(
        driver.wallet.id,
        t,
    );
    if (!driverWallet) {
        throw new NotFoundError('Driver wallet not found');
    }

    // Списываем комиссию с кошелька водителя (может уйти в любой минус)
    const commissionDebit = new Decimal(commissionAmount).negated();
    const wallet = await walletRepository.changeWalletBalance(
        driverWallet,
        commissionDebit,
        t,
    );

    const trans = await transactionRepository.createTransaction(
        {
            walletId: driverWallet.id,
            type: TransactionType.COMMISSION,
            amount: commissionDebit.toNumber(),
            status: TransactionStatus.COMPLETED,
            description: `Commission for completed trip #${trip.id.substring(0, 8)} (${COMMISSION_CONFIG.TRIP_COMMISSION_PERCENTAGE}%)`,
            relatedEntityId: trip.id,
            relatedEntityType: 'trip',
        },
        t,
    );

    if (!trans) {
        throw new InternalServerError(
            'Failed to create commission transaction',
            ErrorCode.INTERNAL_UNEXPECTED,
        );
    }

    logger.info(
        {
            tripId: trip.id,
            driverId: trip.driver_id,
            commissionAmount,
            totalRevenue: totalTripRevenue,
        },
        'Commission charged for completed trip',
    );

    return { wallet, commissionAmount };
};

export const completeTrip = async (tripId: string, driverId: string) => {
    const {
        updatedTrip,
        trip,
        bookings,
        wallet,
        commissionAmount,
        driverProfile,
        deliveredParcels,
        droppedParcels,
    } = await withDeadlockRetry(async (t) => {
        const trip = await tripRepository.findTripByIdAndDriver(
            tripId,
            driverId,
            t,
            true, // FOR UPDATE lock — prevents double-complete race condition
        );

        if (!trip) {
            throw new NotFoundError('Trip not found');
        }

        // Единая точка смены статуса трипа: недопустимый переход (complete из
        // CREATED, двойной complete) → BadRequestError TRIP_INVALID_TRANSITION (400)
        const newStatus = await tripStateMachine.transition(
            trip.status,
            TripTransitionEvent.COMPLETE_TRIP,
            {
                tripId: trip.id,
                driverId: trip.driver_id,
            },
        );

        // if (!canCompleteTrip(trip.departure_ts)) {
        //    throw new BadRequestError(
        //       'Trip can only be completed 40 minutes after departure',
        //    );
        // } todo: fix in prod

        const updatedTrip = await tripRepository.updateTrip(
            trip,
            {
                status: newStatus,
                trip_end_ts: getCurrentTimeUTC(),
            },
            t,
        );

        const { wallet, commissionAmount } = await chargeDriverForTripCommission(
            updatedTrip,
            t,
        );

        const bookings = await findAllBookingsByStatus(
            tripId,
            BookingStatus.CONFIRMED,
            t,
        );

        // Посылки: PICKED_UP → DELIVERED (рейс доехал), PENDING/CONFIRMED →
        // CANCELLED (водитель завершил рейс, так и не забрав посылку) —
        // иначе заявка зависла бы на завершённом трипе навсегда.
        const activeParcels = await parcelRepository.findActiveParcelsByTrip(
            tripId,
            t,
        );
        const deliveredParcels: Parcel[] = [];
        const droppedParcels: Parcel[] = [];
        for (const parcel of activeParcels) {
            if (parcel.status === ParcelStatus.PICKED_UP) {
                parcel.status = ParcelStatus.DELIVERED;
                await parcelRepository.saveParcel(parcel, t);
                deliveredParcels.push(parcel);
            } else {
                await parcelRepository.cancelParcelWithReason(
                    parcel.id,
                    'Trip completed without parcel pickup.',
                    t,
                );
                droppedParcels.push(parcel);
            }
        }

        // Инвалидация кэша строго после commit: до него другой запрос перечитал
        // бы старые данные и закэшировал их заново; при deadlock-retry
        // afterCommit не срабатывает на откатах
        t.afterCommit(() => {
            const invalidations = [
                clearCache(`trip:details:${tripId}:*`),
                clearCache('trip:search:*'),
                clearCache(`user:activity:${driverId}:*`),
            ];
            for (const parcel of activeParcels) {
                invalidations.push(clearCache(`user:parcels:${parcel.sender_id}`));
            }
            Promise.all(invalidations).catch((err) =>
                logger.warn({ err }, 'Cache invalidation failed'),
            );

            // WS: статус трипа сменился на COMPLETED
            emitTripStatusUpdate(updatedTrip, [
                driverId,
                ...bookings.map((b) => b.passengerId),
            ]);
        });

        const driverProfile = await userRepository.findUserByIdProfile(driverId);

        logger.info(
            { tripId: updatedTrip.id, driverId, walletBalance: wallet.balance },
            'Trip completed successfully',
        );

        return {
            updatedTrip,
            trip,
            bookings,
            wallet,
            commissionAmount,
            driverProfile,
            deliveredParcels,
            droppedParcels,
        };
    });

    logger.info(
        { tripId, passengerCount: bookings.length },
        'Sending complete notifications to passengers',
    );

    await Promise.all(
        bookings.map((booking) =>
            publishTripNotification({
                recipientId: booking.passengerId,
                eventType: 'end_trip',
                metadata: {
                    tripId: tripId,
                    status: updatedTrip.status,
                    driverId: driverId,
                    passengerId: booking.passengerId,
                },
                translation: {
                    key: 'notification.trip.completed.passenger',
                    params: {
                        fromCity: booking.from_city,
                        toCity: booking.to_city,
                    },
                    titleKey: 'title.trip.completed',
                },
            }).catch((err) =>
                logger.error(
                    { err, tripId: tripId, passengerId: booking.passengerId },
                    'Failed to finish trip notification to passenger',
                ),
            ),
        ),
    );

    // Уведомления отправителям посылок — после commit
    for (const parcel of deliveredParcels) {
        publishParcelNotification({
            recipientId: parcel.sender_id,
            eventType: 'delivered',
            metadata: { parcelId: parcel.id, tripId },
            translation: {
                key: 'notification.parcel.delivered.sender',
                titleKey: 'title.parcel.delivered',
            },
        }).catch((err) =>
            logger.error(
                { err, parcelId: parcel.id },
                'Failed to send parcel delivered notification to sender',
            ),
        );
    }
    for (const parcel of droppedParcels) {
        publishParcelNotification({
            recipientId: parcel.sender_id,
            eventType: 'cancelled',
            metadata: { parcelId: parcel.id, tripId },
            translation: {
                key: 'notification.parcel.cancelled.sender',
                params: { cancellationReason: '' },
                titleKey: 'title.parcel.cancelled',
            },
        }).catch((err) =>
            logger.error(
                { err, parcelId: parcel.id },
                'Failed to send parcel cancelled notification to sender',
            ),
        );
    }

    if (wallet.balance < 0) {
        // Инвалидация trip:search:* выполняется в walletRepository.changeWalletBalance
        // при пересечении границы 0 — не дублируем её здесь
        publishWalletNotification({
            recipientId: driverId,
            eventType: 'negative_balance',
            metadata: {
                walletId: wallet.id,
                userId: driverId,
            },
            translation: {
                key: 'notification.wallet.negative_balance.driver',
                params: {
                    balance: wallet.balance,
                },
                titleKey: 'title.wallet.negative_balance',
            },
        }).catch((err) =>
            logger.error(
                { err, tripId: updatedTrip.id },
                'Failed to send negative balance notification to driver',
            ),
        );
    }

    publishTripNotification({
        recipientId: driverId,
        eventType: 'end_trip',
        metadata: {
            tripId: updatedTrip.id,
            status: updatedTrip.status,
            driverId: driverId,
        },
        translation: {
            key: 'notification.trip.completed.driver',
            params: {
                fromCity: trip.from_city,
                toCity: trip.to_city,
            },
            titleKey: 'title.trip.completed',
        },
    }).catch((err) =>
        logger.error(
            { err, tripId: updatedTrip.id },
            'Failed to finish trip notification to driver',
        ),
    );

    logger.info(
        { tripId, passengerCount: bookings.length },
        'Sent end trip notifications to all passengers',
    );

    return {
        ...formatTripResponse(updatedTrip, null),
        driver: driverProfile ? driverProfile.toJSON() : null,
    };
};

/**
 * Автозавершение протухшего трипа (вызывается только из staleTripProcessor,
 * не из клиентского API). В отличие от completeTrip() умеет закрывать трип
 * не только из IN_PROGRESS, но и из CREATED — водитель так и не нажал
 * «Начать», и рейс всё равно должен закрыться, а не висеть вечно.
 *
 * Комиссия с водителя списывается только если трип реально был IN_PROGRESS
 * (водитель выехал, но забыл нажать «Завершить») — для CREATED поездки не
 * было, списывать не с чего.
 */
export const autoCompleteStaleTrip = async (
    tripId: string,
    driverId: string,
) => {
    const {
        updatedTrip,
        trip,
        originalStatus,
        bookings,
        wallet,
        driverProfile,
        deliveredParcels,
        droppedParcels,
    } = await withDeadlockRetry(async (t) => {
        const trip = await tripRepository.findTripByIdAndDriver(
            tripId,
            driverId,
            t,
            true, // FOR UPDATE lock — prevents double-complete race condition
        );

        if (!trip) {
            throw new NotFoundError('Trip not found');
        }

        const originalStatus = trip.status;

        // Единая точка смены статуса: AUTO_COMPLETE_TRIP разрешён из CREATED
        // и из IN_PROGRESS → COMPLETED. Двойной вызов (трип уже финализирован
        // другим процессом) упадёт тут же с TRIP_INVALID_TRANSITION (400),
        // caller (staleTripProcessor) это ловит и логирует per-trip.
        const newStatus = await tripStateMachine.transition(
            trip.status,
            TripTransitionEvent.AUTO_COMPLETE_TRIP,
            {
                tripId: trip.id,
                driverId: trip.driver_id,
                metadata: { originalStatus },
            },
        );

        const updatedTrip = await tripRepository.updateTrip(
            trip,
            {
                status: newStatus,
                trip_end_ts: getCurrentTimeUTC(),
            },
            t,
        );

        let wallet: Awaited<
            ReturnType<typeof chargeDriverForTripCommission>
        >['wallet'] | null = null;
        if (originalStatus === TripStatus.InProgress) {
            const chargeResult = await chargeDriverForTripCommission(
                updatedTrip,
                t,
            );
            wallet = chargeResult.wallet;
        }

        const bookings = await findAllBookingsByStatus(
            tripId,
            BookingStatus.CONFIRMED,
            t,
        );

        // Посылки: как и в completeTrip — PICKED_UP → DELIVERED, остальные
        // активные отменяем. На трипах, протухших из CREATED, PICKED_UP тут
        // обычно не встречается: рейс фактически не выезжал.
        const activeParcels = await parcelRepository.findActiveParcelsByTrip(
            tripId,
            t,
        );
        const deliveredParcels: Parcel[] = [];
        const droppedParcels: Parcel[] = [];
        for (const parcel of activeParcels) {
            if (parcel.status === ParcelStatus.PICKED_UP) {
                parcel.status = ParcelStatus.DELIVERED;
                await parcelRepository.saveParcel(parcel, t);
                deliveredParcels.push(parcel);
            } else {
                await parcelRepository.cancelParcelWithReason(
                    parcel.id,
                    'Trip auto-completed by stale trip sweep.',
                    t,
                );
                droppedParcels.push(parcel);
            }
        }

        // Инвалидация кэша строго после commit — см. комментарий в completeTrip.
        t.afterCommit(() => {
            const invalidations = [
                clearCache(`trip:details:${tripId}:*`),
                clearCache('trip:search:*'),
                clearCache(`user:activity:${driverId}:*`),
            ];
            for (const parcel of activeParcels) {
                invalidations.push(
                    clearCache(`user:parcels:${parcel.sender_id}`),
                );
            }
            Promise.all(invalidations).catch((err) =>
                logger.warn({ err }, 'Cache invalidation failed'),
            );

            emitTripStatusUpdate(updatedTrip, [
                driverId,
                ...bookings.map((b) => b.passengerId),
            ]);
        });

        const driverProfile = await userRepository.findUserByIdProfile(driverId);

        logger.info(
            {
                tripId: updatedTrip.id,
                driverId,
                originalStatus,
                commissionCharged: originalStatus === TripStatus.InProgress,
            },
            'Stale trip auto-completed',
        );

        return {
            updatedTrip,
            trip,
            originalStatus,
            bookings,
            wallet,
            driverProfile,
            deliveredParcels,
            droppedParcels,
        };
    });

    // Уведомления — после commit транзакции, ровно 1 раз (как в completeTrip).
    await Promise.all(
        bookings.map((booking) =>
            publishTripNotification({
                recipientId: booking.passengerId,
                eventType: 'end_trip',
                metadata: {
                    tripId: tripId,
                    status: updatedTrip.status,
                    driverId: driverId,
                    passengerId: booking.passengerId,
                },
                translation: {
                    key: 'notification.trip.completed.passenger',
                    params: {
                        fromCity: booking.from_city,
                        toCity: booking.to_city,
                    },
                    titleKey: 'title.trip.completed',
                },
            }).catch((err) =>
                logger.error(
                    { err, tripId: tripId, passengerId: booking.passengerId },
                    'Failed to send auto-complete notification to passenger',
                ),
            ),
        ),
    );

    for (const parcel of deliveredParcels) {
        publishParcelNotification({
            recipientId: parcel.sender_id,
            eventType: 'delivered',
            metadata: { parcelId: parcel.id, tripId },
            translation: {
                key: 'notification.parcel.delivered.sender',
                titleKey: 'title.parcel.delivered',
            },
        }).catch((err) =>
            logger.error(
                { err, parcelId: parcel.id },
                'Failed to send parcel delivered notification to sender',
            ),
        );
    }
    for (const parcel of droppedParcels) {
        publishParcelNotification({
            recipientId: parcel.sender_id,
            eventType: 'cancelled',
            metadata: { parcelId: parcel.id, tripId },
            translation: {
                key: 'notification.parcel.cancelled.sender',
                params: { cancellationReason: '' },
                titleKey: 'title.parcel.cancelled',
            },
        }).catch((err) =>
            logger.error(
                { err, parcelId: parcel.id },
                'Failed to send parcel cancelled notification to sender',
            ),
        );
    }

    // Комиссия списывалась только если трип был реально IN_PROGRESS —
    // wallet будет null для протухших CREATED, уведомление о минусе не шлём.
    if (wallet && wallet.balance < 0) {
        publishWalletNotification({
            recipientId: driverId,
            eventType: 'negative_balance',
            metadata: {
                walletId: wallet.id,
                userId: driverId,
            },
            translation: {
                key: 'notification.wallet.negative_balance.driver',
                params: {
                    balance: wallet.balance,
                },
                titleKey: 'title.wallet.negative_balance',
            },
        }).catch((err) =>
            logger.error(
                { err, tripId: updatedTrip.id },
                'Failed to send negative balance notification to driver',
            ),
        );
    }

    publishTripNotification({
        recipientId: driverId,
        eventType: 'end_trip',
        metadata: {
            tripId: updatedTrip.id,
            status: updatedTrip.status,
            driverId: driverId,
        },
        translation: {
            key: 'notification.trip.completed.driver',
            params: {
                fromCity: trip.from_city,
                toCity: trip.to_city,
            },
            titleKey: 'title.trip.completed',
        },
    }).catch((err) =>
        logger.error(
            { err, tripId: updatedTrip.id },
            'Failed to send auto-complete notification to driver',
        ),
    );

    logger.info(
        { tripId, driverId, originalStatus, passengerCount: bookings.length },
        'Sent stale trip auto-complete notifications',
    );

    return {
        ...formatTripResponse(updatedTrip, null),
        driver: driverProfile ? driverProfile.toJSON() : null,
    };
};

export const cancelTrip = async (tripId: string, driverId: string) => {
    // Транзакция только для DB-операций. Уведомления — снаружи,
    // чтобы не дублироваться при повторе withDeadlockRetry.
    const { canceledTrip, trip, bookings, parcels } = await withDeadlockRetry(
        async (t) => {
            const trip = await tripRepository.findTripByIdAndDriver(
                tripId,
                driverId,
                t,
                true, // FOR UPDATE lock
            );

            if (!trip) {
                throw new NotFoundError('Trip not found');
            }

            const cancellationReason = 'Trip cancelled by driver.';
            let totalSeatsToReturn: number = 0;

            const confirmedBookings = await bookingRepository.findAllBookings(
                trip.id,
                t,
            );

            // PENDING-запросы мест не держат и промокод не тратили, но оставлять их
            // живыми на отменённом рейсе нельзя — пассажир вечно ждал бы ответа.
            const pendingBookings = await findAllBookingsByStatus(
                tripId,
                BookingStatus.PENDING,
                t,
            );
            for (const booking of pendingBookings) {
                await bookingRepository.cancelBookingWithReason(
                    booking.id,
                    cancellationReason,
                    t,
                );
            }

            // Уведомляем всех, кто ждал этот рейс, — и подтверждённых, и ожидающих.
            const bookings = [...confirmedBookings, ...pendingBookings];

            for (let i = 0; i < confirmedBookings.length; i++) {
                const booking = confirmedBookings[i];

                totalSeatsToReturn += booking.seatsBooked;

                const userPromoCode = await promocodeRepository.findByUserId(
                    booking.passengerId,
                    t,
                );
                if (userPromoCode && !userPromoCode.isActive) {
                    userPromoCode.isActive = true;
                    await promocodeRepository.save(userPromoCode, t);

                    const user = await userRepository.findUserById(
                        booking.passengerId,
                        t,
                    );
                    if (user) {
                        user.isHavePromocode = true;
                        await userRepository.saveUser(user, t);
                    }

                    logger.info(
                        {
                            bookingId: booking.id,
                            passengerId: booking.passengerId,
                            promoCodeId: userPromoCode.id,
                        },
                        'Promo code restored after trip cancellation',
                    );
                }

                await bookingRepository.cancelBookingWithReason(
                    booking.id,
                    cancellationReason,
                    t,
                );
            }

            if (totalSeatsToReturn > 0) {
                await tripRepository.updateTripSeatsAvailable(
                    trip,
                    trip.seats_available + totalSeatsToReturn,
                    t,
                );
            }

            // Посылки: активные заявки (PENDING/CONFIRMED/PICKED_UP) гасим
            // вместе с трипом — отправитель не должен ждать отменённый рейс.
            const parcels = await parcelRepository.findActiveParcelsByTrip(
                trip.id,
                t,
            );
            for (const parcel of parcels) {
                await parcelRepository.cancelParcelWithReason(
                    parcel.id,
                    cancellationReason,
                    t,
                );
            }

            const canceledTrip = await tripRepository.cancelTrip(trip, t);

            // Инвалидация кэша строго после commit: до него другой запрос перечитал
            // бы старые данные и закэшировал их заново; при deadlock-retry
            // afterCommit не срабатывает на откатах
            t.afterCommit(() => {
                const invalidations = [
                    clearCache(`trip:details:${tripId}:*`),
                    clearCache('trip:search:*'),
                    clearCache(`user:activity:${driverId}:*`),
                ];
                for (const booking of bookings) {
                    invalidations.push(
                        clearCache(`user:activity:${booking.passengerId}:*`),
                        clearCache(`user:bookings:${booking.passengerId}`),
                    );
                }
                for (const parcel of parcels) {
                    invalidations.push(
                        clearCache(`user:parcels:${parcel.sender_id}`),
                    );
                }
                Promise.all(invalidations).catch((err) =>
                    logger.warn({ err }, 'Cache invalidation failed'),
                );

                // WS: статус трипа сменился на CANCELED — уведомляем и
                // подтверждённых, и ожидавших ответа (PENDING) пассажиров.
                emitTripStatusUpdate(canceledTrip, [
                    driverId,
                    ...bookings.map((b) => b.passengerId),
                ]);
            });

            logger.info({ tripId, driverId }, 'Trip cancelled successfully');

            return { canceledTrip, trip, bookings, parcels };
        },
    );

    // Уведомления отправляем ПОСЛЕ успешного commit транзакции — ровно 1 раз
    logger.info(
        { tripId, passengerCount: bookings.length },
        'Sending cancel notifications to passengers',
    );

    await Promise.all(
        bookings.map((booking) =>
            publishTripNotification({
                recipientId: booking.passengerId,
                eventType: 'end_trip',
                metadata: {
                    tripId: tripId,
                    status: canceledTrip.status,
                    driverId: driverId,
                    passengerId: booking.passengerId,
                },
                translation: {
                    key: 'notification.trip.cancelled.passenger',
                    params: {
                        fromCity: booking.from_city,
                        toCity: booking.to_city,
                    },
                    titleKey: 'title.trip.cancelled',
                },
            }).catch((err) =>
                logger.error(
                    { err, tripId: tripId },
                    'Failed to cancel booking trip notification to passenger',
                ),
            ),
        ),
    );

    // Отправители посылок узнают об отмене рейса так же, как пассажиры
    for (const parcel of parcels) {
        publishParcelNotification({
            recipientId: parcel.sender_id,
            eventType: 'cancelled',
            metadata: { parcelId: parcel.id, tripId },
            translation: {
                key: 'notification.parcel.cancelled.sender',
                params: { cancellationReason: '' },
                titleKey: 'title.parcel.cancelled',
            },
        }).catch((err) =>
            logger.error(
                { err, parcelId: parcel.id },
                'Failed to send parcel cancelled notification to sender',
            ),
        );
    }

    publishTripNotification({
        recipientId: driverId,
        eventType: 'end_trip',
        metadata: {
            tripId: canceledTrip.id,
            status: canceledTrip.status,
            driverId: driverId,
        },
        translation: {
            key: 'notification.trip.cancelled.driver',
            params: {
                fromCity: trip.from_city,
                toCity: trip.to_city,
            },
            titleKey: 'title.trip.cancelled',
        },
    }).catch((err) =>
        logger.error(
            { err, tripId: trip.id },
            'Failed to cancel trip notification to driver',
        ),
    );

    return {
        message:
            'Trip and all associated bookings have been successfully cancelled.',
        canceledTrip: formatTripResponse(canceledTrip, null),
    };
};

const getDistance = (p1, p2) => {
    const R = 6371; // Радиус Земли в км
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const optimizeRoute = (start, points) => {
    const result = [];
    let current = start;
    const remaining = [...points];

    while (remaining.length > 0) {
        let nearestIndex = 0;
        let minDist = getDistance(current, remaining[0]);

        for (let i = 1; i < remaining.length; i++) {
            const dist = getDistance(current, remaining[i]);
            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }

        current = remaining[nearestIndex];
        result.push(current);
        remaining.splice(nearestIndex, 1);
    }
    return result;
};