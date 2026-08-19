import { Op } from 'sequelize';
import Trip, { TripStatus } from '../../../trips/models/Trip';
import { autoCompleteStaleTrip } from '../../../trips/service/tripLifecycleService';
import logger from '../../../../shared/utils/logger';

/**
 * Через сколько часов после времени выезда трип считается «протухшим».
 * Сутки — водитель, реально выехавший с опозданием, успевает нажать «Начать»
 * и «Завершить»; межгород Ташкент–Самарканд идёт ~4 часа.
 */
const STALE_TRIP_GRACE_HOURS = Number(process.env.STALE_TRIP_GRACE_HOURS ?? 24);

/** Сколько трипов чиним за один проход — защита от разбора многолетнего долга. */
const BATCH_LIMIT = Number(process.env.STALE_TRIP_BATCH_LIMIT ?? 500);

/**
 * Трипы водителей, импортированных из Telegram, никто не переводит по статусам:
 * водитель в приложение не заходит, «Начать»/«Завершить» не нажимает. В итоге
 * рейсы недельной давности висят в CREATED/IN_PROGRESS и путают водителя, если
 * он всё-таки откроет приложение, а пассажирские брони на них ждут ответа вечно.
 *
 *   CREATED     → COMPLETED  (водитель не нажал «Начать» за сутки — комиссия
 *                             НЕ списывается, поездки не было)
 *   IN_PROGRESS → COMPLETED  (водитель выехал, но не закрыл рейс — комиссия
 *                             списывается как обычно)
 *
 * Оба случая идут через autoCompleteStaleTrip() и отдельный event
 * AUTO_COMPLETE_TRIP в state machine — переход CREATED→COMPLETED вручную
 * (из клиентского API) по-прежнему запрещён, это только для авто-свипа.
 *
 * Прогнозные трипы (is_predicted) сюда НЕ попадают: их снимает предиктор своим
 * ежечасным проходом через soft-delete. Если перевести прогноз в COMPLETED, строка
 * останется живой и навсегда займёт свой день в uq_trips_predicted_day,
 * заблокировав генерацию нового прогноза на эту дату.
 *
 * Каждый трип обрабатывается отдельно: сбой на одном не роняет остальные.
 */
export const expireStaleTrips = async (): Promise<void> => {
    const cutoff = new Date(
        Date.now() - STALE_TRIP_GRACE_HOURS * 60 * 60 * 1000,
    );

    const stale = await Trip.findAll({
        attributes: ['id', 'driver_id', 'status'],
        where: {
            is_predicted: false,
            status: { [Op.in]: [TripStatus.Created, TripStatus.InProgress] },
            departure_ts: { [Op.lt]: cutoff },
        },
        order: [['departure_ts', 'ASC']],
        limit: BATCH_LIMIT,
    });

    if (stale.length === 0) return;

    let completedFromCreated = 0;
    let completedFromInProgress = 0;
    let failed = 0;

    for (const trip of stale) {
        try {
            await autoCompleteStaleTrip(trip.id, trip.driver_id);
            if (trip.status === TripStatus.Created) {
                completedFromCreated++;
            } else {
                completedFromInProgress++;
            }
        } catch (err) {
            failed++;
            logger.error(
                { err, tripId: trip.id, status: trip.status },
                'Stale trips: failed to finalize trip',
            );
        }
    }

    logger.info(
        {
            completedFromCreated,
            completedFromInProgress,
            failed,
            graceHours: STALE_TRIP_GRACE_HOURS,
        },
        'Stale trips: sweep completed',
    );

    if (stale.length === BATCH_LIMIT) {
        logger.warn(
            { limit: BATCH_LIMIT },
            'Stale trips: batch limit reached — remaining trips will be handled next run',
        );
    }
};