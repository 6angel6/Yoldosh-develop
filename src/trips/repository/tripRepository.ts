import {
    Trip,
    TripAttributes,
    TripStatus,
    GarageStatus,
    BookingType,
} from '../models/Trip';
import Car from '../../car/model/Car';
import User, { RegistrationSource } from '../../user/models/User';
import Booking, { BookingStatus } from '../../booking/models/Booking';
import sequelize, { Op, Sequelize, Transaction } from 'sequelize';
import {
    tripStateMachine,
    TripTransitionEvent,
} from '../service/tripStateMachine';
import {
    getCurrentTimeUTC,
    getStartOfDayUTC,
    getEndOfDayUTC,
    getMinSearchTime,
} from '../../../shared/utils/timeUtils';
import logger from '../../../shared/utils/logger';
import db from "../../../shared/config/database";

/**
 * Нормализует город для fuzzy-сравнения.
 * Убирает апострофы, диакритику, лишние пробелы, приводит к lower.
 * Работает для uz/ru/en без хардкода словарей.
 *
 * Примеры:
 *   "Farg'ona"      → "fargona"
 *   "Qo'rg'on"     → "qorgon"
 *   "Ташкент"      → "tashkent"
 *   "САМАРКАНД"    → "саmarkand" (cyrillic mapped to latin)
 *   "Toshkent sh." → "toshkent sh"
 */
export const normalizeCityForSearch = (city: string): string => {
    return (
        city
            .trim()
            .toLowerCase()
            // Все виды апострофов (узбекский ʻ, типографский ', обычный ', обратный `)
            .replace(/[''`´ʻʼ']/g, '')
            // Специфические кириллические узбекские буквы → латинские эквиваленты
            // (нужно если в БД хранится кириллица, а поиск приходит латиницей)
            .replace(/ў/g, 'u')
            .replace(/қ/g, 'q')
            .replace(/ғ/g, 'g')
            .replace(/ҳ/g, 'h')
            .replace(/ё/g, 'e')
            .replace(/\s+/g, ' ')
            .trim()
    );
};

/**
 * Экранирует строку для безопасной вставки в SQL LIKE-паттерн.
 * - Экранирует % и _ (спецсимволы LIKE)
 * - Экранирует одиночные кавычки для SQL (удваивает их)
 * - Возвращает строку готовую для вставки в SQL literal
 *
 * Пример: "Qo'rg'on" → "'Qo''rg''on'" (готово для LIKE)
 */
export const escapeLikePattern = (s: string): string => {
    let result = s.replace(/[%_\\]/g, '\\$&');
    result = result.replace(/'/g, "''");
    return `'${result}'`;
};

/**
 * Создает SQL LIKE-паттерн вида '%value%' с полным экранированием.
 * Wildcards % находятся ВНУТРИ кавычек (в отличие от ручного
 * `%${escapeLikePattern(x)}%`, который даёт невалидный SQL `%'value'%`).
 *
 * Пример: "Qo'rg'on" → "'%Qo''rg''on%'"
 */
export const buildLikeContainsPattern = (s: string): string => {
    let result = s.replace(/[%_\\]/g, '\\$&');
    result = result.replace(/'/g, "''");
    return `'%${result}%'`;
};

/**
 * Haversine: расстояние по прямой между двумя точками в километрах.
 * Используется для масштабируемого расчёта радиуса поиска, чтобы не
 * зависеть от захардкоженных списков городов.
 */
export const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number => {
    const R = 6371; // радиус Земли в км
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

/**
 * Рассчитывает радиус поиска (в км) на основе длины маршрута.
 *
 * Логика масштабируется на любые города БЕЗ хардкода списков:
 *  - короткие маршруты (< 30км) — узкий радиус 15км
 *    (внутригородские: нужно точное совпадение района)
 *  - средние (30–150км) — 25км (соседние посёлки/пригороды)
 *  - длинные (150–400км) — 40км (межрегиональные)
 *  - очень длинные (400км+) — 60км (Нукус ↔ Ташкент и т.п.)
 *
 * Альтернатива хардкоженному `CITY_POPULATION_ZONES`: радиус теперь
 * зависит только от координат, а не от имени города. Для неизвестного
 * населённого пункта результат будет разумным автоматически.
 */
export const calculateSearchRadius = (
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
): number => {
    const routeKm = haversineKm(fromLat, fromLon, toLat, toLon);

    if (routeKm < 30) return 15;
    if (routeKm < 150) return 25;
    if (routeKm < 400) return 40;
    return 60;
};

export interface CreateTripData {
    car_id: string;
    departure_ts: Date;
    arrival_ts?: Date;

    from_city: string;
    to_city: string;

    from_latitude: number;
    from_longitude: number;
    to_latitude: number;
    to_longitude: number;

    from_address: string;
    to_address: string;

    booking_type: BookingType;

    distance?: number;
    duration?: number;

    seats_available: number;
    price_per_person: number;
    max_two_back: boolean;

    conditioner?: boolean;
    smoking_allowed?: boolean;
    door_pickup?: boolean;
    food_stop?: boolean;
    garage?: GarageStatus;

    // --- Посылки (MVP) ---
    parcels_allowed?: boolean;
    parcel_price?: number | null;

    comment: string;
    driver_id: string;
    status?: TripStatus;

    // Резолвятся в tripCrudService через CityResolver (nullable — если гео не
    // попало ни в один известный город, поездка всё равно создаётся,
    // но в Волну 1 поиска не попадёт)
    from_city_id?: string | null;
    to_city_id?: string | null;

    // --- Trip Predictor (Этап 1): заполняются только для прогнозных копий ---
    is_predicted?: boolean;
    source_trip_id?: string | null;
    pattern_id?: string | null;
    prediction_confidence?: number | null;
    predicted_at?: Date | null;
}

export interface DriverFilterOptions {
    conditioner?: boolean;
    smoking_allowed?: boolean;
    door_pickup?: boolean;
    food_stop?: boolean;
    garage?: GarageStatus;
    parcels_allowed?: boolean;
}

export interface TripSearchOptions {
    from_query?: string;
    to_query?: string;
    from_lat?: number;
    from_lon?: number;
    to_lat?: number;
    to_lon?: number;
    departure_date: string;
    seats_available: number;
}

export const createTrip = async (
    data: CreateTripData,
    transaction?: Transaction,
): Promise<Trip> => {
    return await Trip.create(data, {
        transaction: transaction,
    });
};

export const findCarByIdAndDriver = async (
    carId: string,
    driverId: string,
    transaction?: Transaction,
): Promise<Car | null> => {
    const queryOptions: any = {
        where: {
            id: carId,
            driver_id: driverId,
        },
    };

    if (transaction) {
        queryOptions.transaction = transaction;
    }

    return await Car.findOne(queryOptions);
};

export const findActiveTripByCar = async (
    carId: string,
    transaction?: Transaction,
): Promise<Trip | null> => {
    const queryOptions: any = {
        where: {
            car_id: carId,
            status: {
                [Op.in]: [TripStatus.Created, TripStatus.InProgress],
            },
        },
    };

    if (transaction) {
        queryOptions.transaction = transaction;
    }

    return await Trip.findOne(queryOptions);
};

// Дедуп импорта, уровень 1: тот же водитель + машина (gov_number) + пара
// city_id + окно ±2ч + активный статус (CREATED/IN_PROGRESS).
export const findActiveImportDuplicateByCar = async (
    params: {
        driverId: string;
        carId: string;
        fromCityId: string;
        toCityId: string;
        tsLow: Date;
        tsHigh: Date;
    },
    transaction?: Transaction,
): Promise<Trip | null> => {
    return await Trip.findOne({
        where: {
            driver_id: params.driverId,
            car_id: params.carId,
            from_city_id: params.fromCityId,
            to_city_id: params.toCityId,
            is_predicted: false,
            status: {
                [Op.in]: [TripStatus.Created, TripStatus.InProgress],
            },
            departure_ts: { [Op.between]: [params.tsLow, params.tsHigh] },
        },
        transaction,
    });
};

// Дедуп импорта, уровень 2: гео-дедуп (радиус в метрах) — когда номер не
// пришёл/машины ещё нет. ST_DWithin по from_geo/to_geo.
export const findActiveImportDuplicateByGeo = async (
    params: {
        driverId: string;
        tsLow: Date;
        tsHigh: Date;
        fromLon: number;
        fromLat: number;
        toLon: number;
        toLat: number;
        radiusMeters: number;
    },
    transaction?: Transaction,
): Promise<Trip | null> => {
    return await Trip.findOne({
        where: {
            driver_id: params.driverId,
            is_predicted: false,
            status: {
                [Op.in]: [TripStatus.Created, TripStatus.InProgress],
            },
            departure_ts: { [Op.between]: [params.tsLow, params.tsHigh] },
            [Op.and]: [
                Sequelize.literal(
                    `ST_DWithin(from_geo, ST_SetSRID(ST_MakePoint(${params.fromLon}, ${params.fromLat}), 4326)::geography, ${params.radiusMeters})`,
                ),
                Sequelize.literal(
                    `ST_DWithin(to_geo, ST_SetSRID(ST_MakePoint(${params.toLon}, ${params.toLat}), 4326)::geography, ${params.radiusMeters})`,
                ),
            ],
        },
        transaction,
    });
};

export const findTripByIdAndDriver = async (
    tripId: string,
    driverId?: string,
    transaction?: Transaction,
    lock?: boolean,
): Promise<Trip | null> => {
    return await Trip.findOne({
        where: { id: tripId, driver_id: driverId },
        include: [
            {
                model: Booking,
                as: 'bookings',
                required: false,
                where: {
                    status: {
                        [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
                    },
                },
                attributes: [
                    'id',
                    'seatsBooked',
                    'status',
                    'totalPrice',
                    'passengerId',
                ],
                include: [
                    {
                        model: User,
                        as: 'passenger',
                        attributes: [
                            'id',
                            'firstName',
                            'lastName',
                            'gender',
                            'avatar',
                            'rating',
                            'phoneNumber',
                        ],
                    },
                ],
            },
        ],
        transaction: transaction,
        lock: lock
            ? {
                level: transaction.LOCK.UPDATE,
                of: Trip,
            }
            : undefined,
    });
};

export const updateTrip = async (
    trip: Trip,
    updates: Partial<TripAttributes>,
    transaction?: Transaction,
): Promise<Trip> => {
    return await trip.update(updates, { transaction });
};

export const deleteTrip = async (
    trip: Trip,
    transaction?: Transaction,
): Promise<void> => {
    await trip.destroy({ transaction });
};

export const findTripByIdForDriver = async (
    tripId: string,
): Promise<Trip | null> => {
    return await Trip.findByPk(tripId, {
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
                    'passport_verified',
                    [
                        Sequelize.literal(
                            '(SELECT COUNT(*)::int FROM ratings r WHERE r.rated_user_id = "driver"."id")',
                        ),
                        'ratingCount',
                    ],
                ],
            },
            {
                model: Booking,
                as: 'bookings',
                required: false,
                where: {
                    status: {
                        [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
                    },
                },
                attributes: [
                    'id',
                    'seatsBooked',
                    'status',
                    'totalPrice',
                    'passengerId',
                ],
                include: [
                    {
                        model: User,
                        as: 'passenger',
                        attributes: [
                            'id',
                            'firstName',
                            'lastName',
                            'gender',
                            'avatar',
                            'rating',
                            'phoneNumber',
                        ],
                    },
                ],
            },
            {
                model: Car,
                as: 'car',
                attributes: ['id', 'make', 'model', 'gov_number', 'color'],
            },
        ],
        attributes: {
            exclude: ['car_id', 'updatedAt'],
        },
    });
};

export const cancelTrip = async (
    trip: Trip,
    transaction?: Transaction,
): Promise<Trip> => {
    const newStatus = await tripStateMachine.transition(
        trip.status,
        TripTransitionEvent.CANCEL_TRIP,
        {
            tripId: trip.id,
            driverId: trip.driver_id,
        },
    );

    trip.status = newStatus;
    return await trip.save({ transaction });
};

interface FindActivityParams {
    userId: string;
    role: 'driver' | 'passenger';
    limit: number;
    offset: number;
}

export const findUserActivity = async (
    params: FindActivityParams,
): Promise<{ count: number; rows: Trip[] }> => {
    const { userId, role, limit, offset } = params;

    const whereClause: any = {};
    const isDriver = role === 'driver';

    if (isDriver) {
        whereClause.driver_id = userId;
    }

    const countOptions: any = {
        where: whereClause,
        distinct: true,
        col: 'id',
    };

    if (!isDriver) {
        countOptions.include = [
            {
                model: Booking,
                as: 'bookings',
                where: { passengerId: userId },
                attributes: [],
                required: true,
            },
        ];
    }

    const driverOrder = [
        [
            sequelize.literal(`
            CASE
               WHEN "Trip"."status" = 'IN_PROGRESS' THEN 1
               WHEN "Trip"."status" = 'CREATED' THEN 2
               WHEN "Trip"."status" = 'COMPLETED' THEN 3
               WHEN "Trip"."status" = 'CANCELED' THEN 4
               ELSE 5
            END
         `),
            'ASC',
        ],
        ['departure_ts', 'DESC'],
    ];

    // Для пассажира приоритет — статус его собственной брони:
    // PENDING (request, ждёт водителя) → CONFIRMED → REJECTED → прочее.
    const passengerOrder = [
        [
            sequelize.literal(`
            CASE
               WHEN "bookings"."status" = 'PENDING' THEN 1
               WHEN "bookings"."status" = 'CONFIRMED' THEN 2
               WHEN "bookings"."status" = 'REJECTED' THEN 3
               ELSE 4
            END
         `),
            'ASC',
        ],
        ['departure_ts', 'DESC'],
    ];

    const findOptions: any = {
        where: whereClause,
        limit,
        offset,
        order: isDriver ? driverOrder : passengerOrder,
        subQuery: false,
        attributes: {
            exclude: [
                'driver_id',
                'car_id',
                'updatedAt',
                'comment',
                'distance',
                'duration',
            ],
        },
        include: [
            {
                model: User,
                as: 'driver',
                attributes: [
                    'id',
                    'firstName',
                    'avatar',
                    'rating',
                    'passport_verified',
                    'phoneNumber',
                ],
            },
            {
                model: Car,
                as: 'car',
                attributes: ['id', 'make', 'model'],
            },
            {
                model: Booking,
                as: 'bookings',
                attributes: [
                    'id',
                    'passengerId',
                    'totalPrice',
                    'createdAt',
                    'status',
                ],
                required: !isDriver,
                where: !isDriver ? { passengerId: userId } : undefined,
                separate: isDriver,
            },
        ],
    };

    const [count, rows] = await Promise.all([
        (await Trip.count(countOptions)) as unknown as Promise<number>,
        await Trip.findAll(findOptions),
    ]);

    return {
        count: Array.isArray(count) ? (count as any).length : count,
        rows,
    };
};

export const findTripById = async (
    tripId: string,
    transaction?: Transaction,
) => {
    return await Trip.findByPk(tripId, { transaction });
};

export const findTripByIdPublicDetails = async (
    tripId: string,
    transaction?: Transaction,
): Promise<Trip | null> => {
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
                    'passport_verified',
                    'phoneNumber',
                ],
            },
            {
                model: Car,
                as: 'car',
                attributes: ['id', 'make', 'model', 'gov_number', 'color'],
            },
            {
                model: Booking,
                as: 'bookings',
                required: false,
                where: { status: BookingStatus.CONFIRMED },
                attributes: ['id', 'seatsBooked', 'status'],
                include: [
                    {
                        model: User,
                        as: 'passenger',
                        attributes: ['id', 'firstName', 'avatar', 'rating'],
                    },
                ],
            },
        ],
        attributes: { exclude: ['driver_id', 'car_id', 'updatedAt'] },
        transaction,
    });
};

export const findPopularTripsWithCount = async (
    limit: number,
    offset: number,
): Promise<{ count: number; rows: Trip[] }> => {
    // Только предстоящие поездки: трипы с прошедшим departure_ts остаются
    // CREATED (экспирации нет), поэтому отсекаем их на чтении — иначе
    // протухшие болтаются в ленте «популярных».
    const where = {
        status: TripStatus.Created,
        departure_ts: { [Op.gte]: getCurrentTimeUTC() },
        // Прогнозы (Trip Predictor) не попадают в ленту «популярных»:
        // свежесозданные, они иначе всплыли бы в топ по createdAt DESC.
        is_predicted: false,
    };

    // count считаем БЕЗ include: driver/car (LEFT JOIN) и bookings (required:false)
    // не участвуют в WHERE, поэтому count(*) по trips даёт то же число, что прежний
    // count(DISTINCT "Trip"."id") по раздутому join, но без джойнов и дедупликации.
    // Строки выбираем отдельным findAll с теми же include/limit/offset/order —
    // набор и порядок идентичны прежнему findAndCountAll.
    const [count , rows] = await Promise.all([
        Trip.count({ where }),
        Trip.findAll({
            where,
            limit,
            offset,
            order: [['createdAt', 'DESC']],
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
                        'passport_verified',
                    ],
                },
                {
                    model: Car,
                    as: 'car',
                    attributes: ['id', 'make', 'model', 'gov_number', 'color'],
                },
                {
                    model: Booking,
                    as: 'bookings',
                    required: false,
                    where: { status: BookingStatus.CONFIRMED },
                    attributes: ['id', 'seatsBooked'],
                },
            ],
        }),
    ]);

    return { count, rows };
};

export const findLast50CompletedTripsByCity = async (
    fromCity?: string,
    toCity?: string,
    transaction?: Transaction,
) => {
    const baseWhere: any = {};

    if (fromCity && toCity) {
        const fromNorm = normalizeCityForSearch(fromCity);
        const toNorm = normalizeCityForSearch(toCity);
        const fromEsc = buildLikeContainsPattern(fromNorm);
        const toEsc = buildLikeContainsPattern(toNorm);

        baseWhere[Op.and] = [
            Sequelize.literal(
                `LOWER(REGEXP_REPLACE("Trip"."from_city", '[''ʻʼ\`´]', '', 'g')) LIKE ${fromEsc}`,
            ),
            Sequelize.literal(
                `LOWER(REGEXP_REPLACE("Trip"."to_city", '[''ʻʼ\`´]', '', 'g')) LIKE ${toEsc}`,
            ),
        ];
    }

    // Exclude trips from bot-imported users (from_bot) — they have fake prices
    const driverInclude = {
        model: User,
        as: 'driver',
        attributes: [],
        where: {
            registration_source: {
                [Op.in]: [RegistrationSource.User, RegistrationSource.RegBot],
            },
        },
    };

    // Primary: completed trips (most accurate - real prices paid)
    const completed = await Trip.findAndCountAll({
        where: { ...baseWhere, status: TripStatus.Completed },
        include: [driverInclude],
        order: [['createdAt', 'DESC']],
        limit: 50,
        transaction,
    });

    if (completed.count >= 5) {
        return completed;
    }

    // Fallback: include CREATED trips (current market prices)
    return await Trip.findAndCountAll({
        where: {
            ...baseWhere,
            status: { [Op.in]: [TripStatus.Completed, TripStatus.Created] },
        },
        include: [driverInclude],
        order: [['createdAt', 'DESC']],
        limit: 50,
        transaction,
    });
};

export const findBestTrips = async (limit: number = 5): Promise<Trip[]> => {
    return await Trip.findAll({
        where: {
            status: TripStatus.Created,
            departure_ts: { [Op.gte]: getCurrentTimeUTC() },
            seats_available: { [Op.gt]: 0 },
            is_predicted: false,
        },
        include: [
            {
                model: User,
                as: 'driver',
                required: true,
                where: {
                    registration_source: {
                        [Op.in]: [
                            RegistrationSource.User,
                            RegistrationSource.RegBot,
                            RegistrationSource.FromBot,
                        ],
                    },
                    isBanned: false,
                },
                attributes: [
                    'id',
                    'firstName',
                    'lastName',
                    'avatar',
                    'rating',
                    'passport_verified',
                ],
            },
            {
                model: Car,
                as: 'car',
                attributes: ['id', 'make', 'model', 'gov_number', 'color'],
            },
        ],
        order: [
            [
                db.literal(`
               CASE "driver"."registration_source"
                  WHEN '${RegistrationSource.User}' THEN 1
                  WHEN '${RegistrationSource.RegBot}' THEN 2
                  WHEN '${RegistrationSource.FromBot}' THEN 3
                  ELSE 4
               END
            `),
                'ASC',
            ],
            ['price_per_person', 'ASC'],
            ['departure_ts', 'ASC'],
        ],
        limit,
    });
};

export const findTripByIdWithLock = async (
    tripId: string,
    transaction?: Transaction,
): Promise<Trip | null> => {
    return await Trip.findByPk(tripId, {
        transaction,
        lock: transaction ? Transaction.LOCK.UPDATE : false,
    });
};

export const updateTripSeatsAvailable = async (
    trip: Trip,
    newSeatsAvailable: number,
    transaction?: Transaction,
): Promise<Trip> => {
    trip.seats_available = newSeatsAvailable;
    return await trip.save({ transaction });
};

export const decrementTripSeats = async (
    tripId: string,
    seatsToBook: number,
    transaction: Transaction,
): Promise<boolean> => {
    const [affectedRows] = await Trip.update(
        {
            seats_available: Sequelize.literal(`seats_available - ${seatsToBook}`),
        },
        {
            where: {
                id: tripId,
                seats_available: { [Op.gte]: seatsToBook }, // Гарантия, что не уйдем в минус
            },
            transaction,
        },
    );

    return affectedRows > 0;
};

export interface TripHybridFilterOptions {
    from_lat: number;
    from_lon: number;
    to_lat: number;
    to_lon: number;

    /** Точный город посадки (Волна 1). Если null — Волна 1 пропускается. */
    from_city_id?: string | null;
    to_city_id?: string | null;

    search_from_city?: string;
    search_to_city?: string;

    departure_date: string;
    seats_available: number;
    /**
     * Динамический радиус поиска в км (по умолчанию 40)
     * Для редких/малых городов уменьшить до 25-30
     * Для поиска по крупным городам можно увеличить до 60
     */
    search_radius_km?: number;
}
/**
 * Строгий каскадный поиск: Wave N запускается только когда Wave N-1 пустая.
 * Город-в-город не «разбавляется» соседями — пассажир видит ровно ту
 * категорию, где что-то нашлось.
 *
 *   Волна 1 (exact city-pair)
 *     trips.from_city_id = X AND trips.to_city_id = Y
 *     — B-tree partial idx_trips_city_pair_departure. Основной матч
 *     «Ташкент→Маргилан», когда обе точки пассажира попали в полигоны
 *     городов и водительский трип имеет эти же city_id.
 *
 *   Волна 2 (route_geo fallback, ТОЛЬКО если:
 *     a) Wave1 пустая, И
 *     b) хотя бы одна сторона пассажира — вне city-bbox (кишлак/деревня).
 *     Если пассажир ткнул в обоих городах — Wave1 авторитетна, Wave2 не
 *     запускается: иначе в Ташкент→Самарканд просочился бы Ташкент→Джизак,
 *     чей маршрут проходит рядом с Самаркандом)
 *     ST_DWithin(route_geo, p_from, 15км) AND ST_DWithin(route_geo, p_to, 15км)
 *     AND ST_LineLocatePoint(from) < ST_LineLocatePoint(to)
 *     Плюс: если у пассажира есть from_city_id — требуем t.from_city_id =
 *     тому же, симметрично для to (чтобы коридор не подменял целевой город).
 *
 * Фильтр водителей: drv.is_wallet_blocked = false AND drv.is_banned = false.
 */
// Кол-во рекомендованных трипов (другие даты того же маршрута) по умолчанию —
// это не пагинируемый список, просто витрина «может, вам подойдёт другая дата».
const DEFAULT_RECOMMENDED_TRIPS_LIMIT = 10;

/**
 * Общее ядро гибридного поиска (Wave 1 / Wave 2), параметризованное по
 * диапазону дат. Используется и для «точной даты» (exact), и для
 * «рекомендаций на другие даты» (recommended) — вся геосортировка/
 * приоритеты водителей одинаковы, различается только предикат по дате.
 *
 *   mode = 'exact'       → t.departure_ts находится ВНУТРИ [day_start, day_end)
 *   mode = 'recommended' → t.departure_ts находится ВНЕ [day_start, day_end),
 *                            но не раньше "сейчас"
 *
 * Порядок для recommended специально не учитывает inwaveOrder по цене/времени
 * пользователя — последним ключом сортировки всегда идёт departure_ts ASC.
 * Это даёт нужную группировку «на глаз»: сначала более ранние даты, близкие
 * к выбранной (например 21, 22 при выбранной 23), затем более поздние
 * (24, 25, ...) — просто потому что хронологически "до" меньше "после".
 */
const runHybridRanking = async (
    mode: 'exact' | 'recommended',
    filters: TripHybridFilterOptions,
    limit: number,
    offset: number,
    driverFilters?: DriverFilterOptions,
    sortOptions?: { sortByPrice?: string; sortByTime?: string },
): Promise<{
    total: number;
    ranked: Array<{ id: string; wave: number; score: number }>;
}> => {
    const searchDate = new Date(filters.departure_date);
    const dayStart = getStartOfDayUTC(searchDate);
    const dayEnd = getEndOfDayUTC(searchDate);
    const minDepartureTime =
        mode === 'exact' ? getMinSearchTime(searchDate) : getCurrentTimeUTC();
    const corridorRadiusM = 15000; // «близко к трассе» — 15 км

    const datePredicateSql =
        mode === 'exact'
            ? `t.departure_ts >= p.min_dep AND t.departure_ts < p.day_end`
            : `t.departure_ts >= p.min_dep AND (t.departure_ts < p.day_start OR t.departure_ts >= p.day_end)`;

    // Доп. фильтры водителя (кондиционер/курение/гараж) — AND во всех волнах
    const extraWhere: string[] = [];
    if (driverFilters?.conditioner === true)
        extraWhere.push(`t.conditioner = true`);
    if (driverFilters?.smoking_allowed === true)
        extraWhere.push(`t.smoking_allowed = true`);
    if (driverFilters?.smoking_allowed === false)
        extraWhere.push(`t.smoking_allowed = false`);
    if (driverFilters?.door_pickup === true)
        extraWhere.push(`t.door_pickup = true`);
    if (driverFilters?.food_stop === true) extraWhere.push(`t.food_stop = true`);
    if (driverFilters?.parcels_allowed === true)
        extraWhere.push(`t.parcels_allowed = true`);
    if (driverFilters?.garage) {
        extraWhere.push(
            `t.garage = '${driverFilters.garage.replace(/'/g, "''")}'`,
        );
    }
    const extraWhereSql = extraWhere.length
        ? ` AND ${extraWhere.join(' AND ')}`
        : '';

    // Опциональная досортировка внутри волны (поверх базового ранжирования).
    // Для recommended игнорируем пользовательский sort_by — там последний
    // ключ всегда departure_ts ASC (см. комментарий к функции).
    let inwaveOrder = 'c.departure_ts ASC';
    if (mode === 'exact') {
        if (sortOptions?.sortByPrice === 'cheapest')
            inwaveOrder = 'c.price_per_person ASC';
        else if (sortOptions?.sortByPrice === 'expensive')
            inwaveOrder = 'c.price_per_person DESC';
        else if (sortOptions?.sortByTime === 'earliest')
            inwaveOrder = 'c.departure_ts ASC';
        else if (sortOptions?.sortByTime === 'latest')
            inwaveOrder = 'c.departure_ts DESC';
    }

    // Параметры:
    //   $1 from_city_id, $2 to_city_id   (Волна 1, nullable)
    //   $3 pFromLng, $4 pFromLat, $5 pToLng, $6 pToLat  (Волна 2)
    //   $7 min_departure, $8 seats
    //   $9 day_start, $10 day_end
    //   $11 limit, $12 offset
    const rankingSql = `
      WITH params AS (
         SELECT
            $1::uuid AS from_city_id,
            $2::uuid AS to_city_id,
            ST_SetSRID(ST_MakePoint($3::float, $4::float), 4326)::geography AS p_from,
            ST_SetSRID(ST_MakePoint($5::float, $6::float), 4326)::geography AS p_to,
            $7::timestamptz AS min_dep,
            $8::int AS seats,
            $9::timestamptz AS day_start,
            $10::timestamptz AS day_end
      ),
      wave1 AS (
         SELECT t.id,
                1::smallint AS wave,
                0::float AS score,
                CASE drv.registration_source
                   WHEN 'user' THEN 1
                   WHEN 'reg_bot' THEN 2
                   WHEN 'from_bot' THEN 3
                   ELSE 4
                END::smallint AS reg_priority,
                -- Трипы со скрипта/парсера часто заводятся под тем же
                -- registration_source, но с price_per_person = 0 (цена не
                -- проставлена). Реальная цена (> 0) — сигнал, что водитель
                -- сам её выставил, поэтому такие трипы поднимаем ВЫШЕ
                -- нулевых внутри своего тира, но не выше других тиров.
                CASE WHEN t.price_per_person > 0 THEN 0 ELSE 1 END::smallint AS priced_first,
                t.is_predicted,
                t.departure_ts,
                t.price_per_person
           FROM trips t
           JOIN users drv ON drv.id = t.driver_id
                AND drv.is_wallet_blocked = false
                AND drv.is_banned = false
          CROSS JOIN params p
          WHERE t.status = 'CREATED'
            AND t.deleted_at IS NULL
            AND t.seats_available >= p.seats
            AND ${datePredicateSql}
            AND p.from_city_id IS NOT NULL
            AND p.to_city_id IS NOT NULL
            AND t.from_city_id = p.from_city_id
            AND t.to_city_id   = p.to_city_id
            ${extraWhereSql}
      ),
      wave1_empty AS (
         SELECT NOT EXISTS (SELECT 1 FROM wave1) AS yes
      ),
      wave2 AS (
         SELECT t.id,
                2::smallint AS wave,
                (ST_Distance(t.route_geo, p.p_from) + ST_Distance(t.route_geo, p.p_to))::float AS score,
                CASE drv.registration_source
                   WHEN 'user' THEN 1
                   WHEN 'reg_bot' THEN 2
                   WHEN 'from_bot' THEN 3
                   ELSE 4
                END::smallint AS reg_priority,
                CASE WHEN t.price_per_person > 0 THEN 0 ELSE 1 END::smallint AS priced_first,
                t.is_predicted,
                t.departure_ts,
                t.price_per_person
           FROM trips t
           JOIN users drv ON drv.id = t.driver_id
                AND drv.is_wallet_blocked = false
                AND drv.is_banned = false
          CROSS JOIN params p
          WHERE (SELECT yes FROM wave1_empty)
            -- Wave2 имеет смысл только когда хотя бы одна точка пассажира
            -- вне города. Иначе Wave1 авторитетна: либо есть точный матч,
            -- либо пустой результат, а коридор только размыл бы направление.
            AND (p.from_city_id IS NULL OR p.to_city_id IS NULL)
            AND t.status = 'CREATED'
            AND t.deleted_at IS NULL
            AND t.seats_available >= p.seats
            AND ${datePredicateSql}
            AND t.route_geo IS NOT NULL
            AND ST_DWithin(t.route_geo, p.p_from, ${corridorRadiusM})
            AND ST_DWithin(t.route_geo, p.p_to,   ${corridorRadiusM})
            AND ST_LineLocatePoint(t.route_geo::geometry, p.p_from::geometry)
              < ST_LineLocatePoint(t.route_geo::geometry, p.p_to::geometry)
            -- Если пассажир резолвнулся в город с одной стороны — требуем,
            -- чтобы трип шёл в тот же город. Иначе «кишлак → Самарканд»
            -- притянул бы «кишлак → Джизак» только из-за близости коридора.
            AND (p.from_city_id IS NULL OR t.from_city_id = p.from_city_id)
            AND (p.to_city_id   IS NULL OR t.to_city_id   = p.to_city_id)
            ${extraWhereSql}
      ),
      combined AS (
         SELECT * FROM wave1
         UNION ALL
         SELECT * FROM wave2
      ),
      counted AS (SELECT COUNT(*)::int AS total FROM combined)
      SELECT c.id, c.wave, c.score, c.reg_priority,
             (SELECT total FROM counted) AS total_count
        FROM combined c
       -- Приоритет источника водителя — АБСОЛЮТНЫЙ первый ключ:
       -- сначала все 'user' (1), потом 'reg_bot' (2), потом 'from_bot' (3),
       -- независимо от волны/score/даты вылета.
       -- Внутри тира источника: сначала трипы с реально проставленной ценой
       -- (priced_first), затем реальные трипы (is_predicted=false) выше
       -- прогнозных (Trip Predictor), затем волна/score/дата.
       ORDER BY c.reg_priority ASC, c.priced_first ASC, c.is_predicted ASC, c.wave ASC, c.score ASC, ${inwaveOrder}
       LIMIT $11 OFFSET $12;
   `;

    const ranked = (await Trip.sequelize!.query(rankingSql, {
        bind: [
            filters.from_city_id ?? null,
            filters.to_city_id ?? null,
            filters.from_lon,
            filters.from_lat,
            filters.to_lon,
            filters.to_lat,
            minDepartureTime,
            filters.seats_available,
            dayStart,
            dayEnd,
            limit,
            offset,
        ],
        type: sequelize.QueryTypes.SELECT,
    })) as Array<{
        id: string;
        wave: number;
        score: number;
        total_count: number;
    }>;

    const total = ranked[0]?.total_count ?? 0;

    const waveCounts = ranked.reduce(
        (acc, r) => {
            acc[r.wave] = (acc[r.wave] ?? 0) + 1;
            return acc;
        },
        {} as Record<number, number>,
    );
    logger.info(
        {
            mode,
            wave1_exact: waveCounts[1] ?? 0,
            wave2_route: waveCounts[2] ?? 0,
            total,
        },
        'Hybrid search waves fired',
    );

    return { total, ranked };
};

/**
 * Гидрирует список ранжированных id трипов (driver/car) и восстанавливает
 * порядок, выданный SQL-ранжированием.
 */
const hydrateRankedTrips = async (
    ranked: Array<{ id: string; wave: number; score: number }>,
): Promise<any[]> => {
    if (ranked.length === 0) return [];

    const ids = ranked.map((r) => r.id);
    const rankByTripId = new Map(
        ranked.map((r, idx) => [
            r.id,
            { wave: r.wave, score: r.score, order: idx },
        ]),
    );

    const hydrated = await Trip.findAll({
        where: { id: { [Op.in]: ids } },
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
                    'passport_verified',
                    'registration_source',
                ],
            },
            { model: Car, as: 'car', attributes: ['id', 'make', 'model'] },
        ],
    });

    return hydrated
        .map((t: any) => {
            const rank = rankByTripId.get(t.id)!;
            // 1 = exact city-pair, 2 = route corridor
            t.setDataValue('wave', rank.wave);
            t.setDataValue('corridor_deviation_m', rank.score); // 0 для Волны 1
            return { trip: t, order: rank.order };
        })
        .sort((a, b) => a.order - b.order)
        .map((x) => x.trip);
};

// Трипы РОВНО на выбранную дату (departure_ts внутри [day_start, day_end)).
// Пагинируется как обычно.
export const findHybridTrips = async (
    filters: TripHybridFilterOptions,
    limit: number,
    offset: number,
    driverFilters?: DriverFilterOptions,
    sortOptions?: { sortByPrice?: string; sortByTime?: string },
): Promise<{ count: number; rows: any[] }> => {
    const queryStartTime = Date.now();

    const { total, ranked } = await runHybridRanking(
        'exact',
        filters,
        limit,
        offset,
        driverFilters,
        sortOptions,
    );

    if (ranked.length === 0) {
        return { count: 0, rows: [] };
    }

    const rowsOrdered = await hydrateRankedTrips(ranked);

    const queryDuration = Date.now() - queryStartTime;
    if (queryDuration > 800) {
        logger.warn(
            {
                duration: queryDuration,
                total,
                from_city_id: filters.from_city_id,
                to_city_id: filters.to_city_id,
            },
            'Slow findHybridTrips query — consider index/plan review',
        );
    }

    return { count: total, rows: rowsOrdered };
};

// Трипы на том же маршруте, но на ДРУГИЕ даты («может, вам подойдёт этот
// день?»). Не пагинируется, отдаём фиксированный небольшой список,
// отсортированный так, что ближайшие к выбранной дате дни идут первыми
// (сначала более ранние, потом более поздние — см. комментарий у
// runHybridRanking).
export const findHybridTripsRecommended = async (
    filters: TripHybridFilterOptions,
    driverFilters?: DriverFilterOptions,
    limit: number = DEFAULT_RECOMMENDED_TRIPS_LIMIT,
): Promise<any[]> => {
    const { ranked } = await runHybridRanking(
        'recommended',
        filters,
        limit,
        0,
        driverFilters,
    );

    if (ranked.length === 0) return [];

    return hydrateRankedTrips(ranked);
};

export const findHybridTripsPublic = async (
    filters: TripSearchOptions,
    limit: number,
    offset: number,
    driverFilters?: DriverFilterOptions & {
        max_two_back?: boolean;
        pets_allowed?: boolean;
        music_allowed?: boolean;
        talkative?: boolean;
        passport_verified?: boolean;
    },
    sortOptions?: { sortBy?: string; sortOrder?: string },
): Promise<{ count: number; rows: Trip[] }> => {
    const {
        from_query,
        to_query,
        from_lat,
        from_lon,
        to_lat,
        to_lon,
        departure_date,
        seats_available,
    } = filters;

    // ⏰ Определяем минимальное время для поиска (все в UTC)
    const minDate = departure_date
        ? getMinSearchTime(new Date(departure_date))
        : getCurrentTimeUTC();

    const whereClause: any = {
        status: TripStatus.Created,
        seats_available: { [Op.gte]: seats_available },
        departure_ts: { [Op.gte]: minDate },
    };

    const attributesInclude: any[] = [];
    const searchRadiusKm = 50;
    const searchRadiusMeters = searchRadiusKm * 1000;

    // 2. ЛОГИКА ГЕО-ПОИСКА (Если есть координаты) - используем PostGIS ST_DWithin вместо Haversine
    if (from_lat && from_lon && to_lat && to_lon) {
        const searchFromPoint = `ST_SetSRID(ST_MakePoint(${from_lon}, ${from_lat}), 4326)::geography`;
        const searchToPoint = `ST_SetSRID(ST_MakePoint(${to_lon}, ${to_lat}), 4326)::geography`;

        const distanceFromSql = `ST_Distance(from_geo, ${searchFromPoint})`;
        const distanceToSql = `ST_Distance(to_geo, ${searchToPoint})`;

        attributesInclude.push(
            [Sequelize.literal(`${distanceFromSql} / 1000`), 'distanceFromOrigin'],
            [Sequelize.literal(`${distanceToSql} / 1000`), 'distanceToDest'],
        );

        // ГЛАВНОЕ: ST_DWithin использует GiST индекс - гораздо быстрее Haversine bbox!
        whereClause[Op.and] = [
            ...(whereClause[Op.and] || []),
            Sequelize.literal(
                `ST_DWithin(from_geo, ${searchFromPoint}, ${searchRadiusMeters})`,
            ),
            Sequelize.literal(
                `ST_DWithin(to_geo, ${searchToPoint}, ${searchRadiusMeters})`,
            ),
        ];
    } else if (from_query || to_query) {
        if (from_query) {
            const fromQ = normalizeCityForSearch(from_query);
            const fromEsc = buildLikeContainsPattern(fromQ);
            whereClause[Op.and] = [
                ...(whereClause[Op.and] || []),
                Sequelize.literal(`(
               LOWER(REGEXP_REPLACE("Trip"."from_city", '[''ʻʼ\`´]', '', 'g')) LIKE ${fromEsc}
               OR LOWER("Trip"."from_address") LIKE ${fromEsc}
            )`),
            ];
        }
        if (to_query) {
            const toQ = normalizeCityForSearch(to_query);
            const toEsc = buildLikeContainsPattern(toQ);
            whereClause[Op.and] = [
                ...(whereClause[Op.and] || []),
                Sequelize.literal(`(
               LOWER(REGEXP_REPLACE("Trip"."to_city", '[''ʻʼ\`´]', '', 'g')) LIKE ${toEsc}
               OR LOWER("Trip"."to_address") LIKE ${toEsc}
            )`),
            ];
        }
    }

    if (driverFilters) {
        if (driverFilters.conditioner !== undefined)
            whereClause.conditioner = driverFilters.conditioner;
        if (driverFilters.smoking_allowed !== undefined)
            whereClause.smoking_allowed = driverFilters.smoking_allowed;
        if (driverFilters.door_pickup !== undefined)
            whereClause.door_pickup = driverFilters.door_pickup;
        if (driverFilters.food_stop !== undefined)
            whereClause.food_stop = driverFilters.food_stop;
        if (driverFilters.garage !== undefined)
            whereClause.garage = driverFilters.garage;
        if (driverFilters.max_two_back !== undefined)
            whereClause.max_two_back = driverFilters.max_two_back;
        if (driverFilters.parcels_allowed !== undefined)
            whereClause.parcels_allowed = driverFilters.parcels_allowed;
    }

    const registrationSourcePriority = Sequelize.literal(
        `CASE
         WHEN "driver"."registration_source" = 'user' THEN 1
         WHEN "driver"."registration_source" = 'reg_bot' THEN 2
         WHEN "driver"."registration_source" = 'from_bot' THEN 3
         ELSE 4
       END`,
    );

    const orderClause: any = [
        [registrationSourcePriority, 'ASC'],
        // Реальная цена (> 0) — водитель сам её выставил, поднимаем такие
        // трипы выше нулевых (скрипт/парсер) внутри своего тира источника.
        [
            Sequelize.literal(
                `CASE WHEN "Trip"."price_per_person" > 0 THEN 0 ELSE 1 END`,
            ),
            'ASC',
        ],
        // Прогнозы (Trip Predictor) — ниже реальных внутри тира источника.
        ['is_predicted', 'ASC'],
    ];
    if (sortOptions?.sortBy === 'price') {
        orderClause.push([
            'price_per_person',
            sortOptions.sortOrder === 'desc' ? 'DESC' : 'ASC',
        ]);
    } else if (sortOptions?.sortBy === 'departure_date') {
        orderClause.push([
            'departure_ts',
            sortOptions.sortOrder === 'desc' ? 'DESC' : 'ASC',
        ]);
    } else if (!sortOptions?.sortBy && from_lat) {
        orderClause.push([Sequelize.literal('"distanceFromOrigin"'), 'ASC']);
    } else {
        orderClause.push(['departure_ts', 'ASC']);
    }

    // count считаем БЕЗ include/order: whereClause фильтрует только по колонкам trips
    // (status/seats_available/departure_ts/гео ST_DWithin/текст по from_city|to_city|
    // from_address|to_address). driver/car в фильтре не участвуют (required:false,
    // where в ON LEFT JOIN не отсекает строки), поэтому count(*) даёт то же число,
    // что прежний count(DISTINCT "Trip"."id") по раздутому join — но без джойнов и
    // дедупликации.
    const count = await Trip.count({ where: whereClause });

    // Deferred join (как в findHybridTrips): сначала упорядоченная СТРАНИЦА id —
    // лёгкие строки (только id + computed-дистанции для ORDER BY, без driver/car-колонок;
    // driver джойнится лишь ради CASE по registration_source). OFFSET считается по узкой
    // выборке, а не по раздутому join. Затем гидрируем поля по этим id и восстанавливаем
    // порядок в JS. Набор полей, фильтры и порядок идентичны прежнему findAll —
    // меняется только КАК берётся страница.
    const idRows = (await Trip.findAll({
        where: whereClause,
        attributes: ['id', ...attributesInclude],
        include: [
            {
                model: User,
                as: 'driver',
                attributes: [],
                where: driverFilters ? { deletedAt: null } : undefined,
                required: false,
            },
        ],
        order: orderClause,
        limit,
        offset,
        subQuery: false,
        raw: true,
    })) as unknown as Array<{ id: string }>;

    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) {
        return { count, rows: [] };
    }

    const hydrated = await Trip.findAll({
        where: { id: { [Op.in]: ids } },
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
                    'passport_verified',
                    'registration_source',
                    'talkative',
                    'music_allowed',
                    'pets_allowed',
                ],
            },
            {
                model: Car,
                as: 'car',
                attributes: ['id', 'make', 'model', 'color', 'gov_number'],
            },
        ],
        attributes: {
            include: attributesInclude,
        },
    });

    // Восстанавливаем порядок страницы из idRows (гидрация по IN(...) порядок не гарантирует).
    const pos = new Map(ids.map((id, i) => [id, i]));
    const rows = hydrated.sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);

    return { count, rows };
};