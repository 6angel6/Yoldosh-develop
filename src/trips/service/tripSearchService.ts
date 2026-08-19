import * as tripRepository from '../repository/tripRepository';
import * as promocodeRepository from '../../promocode/repository/promocodeRepository';
import * as promocodeService from '../../promocode/service/promocodeService';
import * as userRepository from '../../user/repository/userRepository';
import * as bookingRepository from '../../booking/repository/bookingRepository';
import { searchTripDto } from '../models/dto/tripSearchDto';
import { saveSearch } from '../../user/service/searchService';
import logger from '../../../shared/utils/logger';
import { getOrSetCache } from '../../../shared/config/redis';
import PromoCode from '../../promocode/models/PromoCode';
import { fetchBothLocations } from './helpers/tripHelpers';
import * as cityResolver from '../../city/service/cityResolver';
import { formatTripResponse } from './tripFormatterService';
import { getCurrentTimeUTC } from '../../../shared/utils/timeUtils';

const getUserPromoCode = async (userId?: string): Promise<PromoCode | null> => {
    if (!userId) return null;

    const promoCode = await promocodeRepository.findByUserId(userId);

    if (!promoCode) return null;

    if (promoCode.expiresAt && promoCode.expiresAt < getCurrentTimeUTC()) {
        await promocodeService.deactivatePromoCodeForUser(userId);
        return null;
    }

    return promoCode;
};

const saveSearchHistory = async (
    identifier: { userId?: string; guestId?: string },
    fromGeoData: any,
    toGeoData: any,
) => {
    try {
        await saveSearch({
            ...identifier,
            from_city: fromGeoData.cityName,
            to_city: toGeoData.cityName,
            from_address: fromGeoData.address,
            to_address: toGeoData.address,
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to save search history');
    }
};

/**
 * Фильтр протухших/блокированных + форматирование + is_own_trip.
 * is_booked сюда не входит специально — его считаем ОДНИМ запросом сразу
 * по обоим массивам (см. attachIsBooked), а не по каждому отдельно, чтобы
 * не плодить лишние походы в базу.
 */
const formatRawTrips = (
    rawTrips: any[],
    identifier: { userId?: string; guestId?: string } | undefined,
    userPromoCode: PromoCode | null,
    blockedUserIds: string[],
): any[] => {
    const nowMs = getCurrentTimeUTC().getTime();

    // Защита от кэш-окна (TTL 300с): трип мог отъехать, пока результат лежал
    // в кэше.  departure_ts фильтруем на выдаче — чтобы протухший не показывался
    // даже из кэша (на cache-miss его уже отсёк departure_ts >= min_dep в SQL).
    let filtered = rawTrips.filter(
        (trip: any) => new Date(trip.departure_ts).getTime() >= nowMs,
    );
    if (blockedUserIds.length > 0) {
        filtered = filtered.filter(
            (trip: any) => !blockedUserIds.includes(trip.driver?.id),
        );
    }

    return filtered.map((trip: any) => {
        const f = formatTripResponse(trip, userPromoCode);
        return {
            ...f,
            is_own_trip: identifier?.userId
                ? f.driver?.id === identifier.userId
                : false,
        };
    });
};

/**
 * is_booked — свежий, ОДИН запрос по всем tripIds сразу из обоих массивов
 * (trips + recommended_trips), как и раньше был один запрос на страницу.
 */
const attachIsBooked = async (
    userId: string | undefined,
    tripLists: any[][],
): Promise<any[][]> => {
    if (!userId) return tripLists;

    const allTripIds = tripLists.flatMap((list) => list.map((t: any) => t.id));
    if (allTripIds.length === 0) return tripLists;

    const bookedTripIds = await bookingRepository.findBookedTripIdsByUser(
        userId,
        allTripIds,
    );

    return tripLists.map((list) =>
        list.map((trip: any) => ({
            ...trip,
            is_booked: bookedTripIds.has(trip.id),
        })),
    );
};

export const searchTrips = async (
    searchData: searchTripDto,
    page: number,
    limit: number,
    identifier?: { userId?: string; guestId?: string },
) => {
    // Резолв координат пассажира → city ДО кеша, чтобы ключ зависел от
    // city_id, а не от сырых координат. Два разных пина внутри полигона
    // Ташкента теперь идут в один и тот же кеш-запрос. Сам резолв дешёвый:
    // in-memory LRU внутри cityResolver, ~110м-округление точки.
    const [fromTarget, toTarget] = await Promise.all([
        cityResolver.resolveSearchTarget(
            searchData.from_longitude,
            searchData.from_latitude,
        ),
        cityResolver.resolveSearchTarget(
            searchData.to_longitude,
            searchData.to_latitude,
        ),
    ]);

    // Для деревенских точек (city_id=null) ключ берёт координаты с точностью
    // ~1км (2 знака после запятой), чтобы близкие клики не дробили кеш.
    const fromKey =
        fromTarget.city?.id ??
        `g:${searchData.from_longitude.toFixed(2)},${searchData.from_latitude.toFixed(2)}`;
    const toKey =
        toTarget.city?.id ??
        `g:${searchData.to_longitude.toFixed(2)},${searchData.to_latitude.toFixed(2)}`;

    const cacheKey = `trip:search:${JSON.stringify({
        from: fromKey,
        to: toKey,
        departure_date: searchData.departure_date,
        seats: searchData.requested_seats,
        conditioner: searchData.conditioner,
        smoking_allowed: searchData.smoking_allowed,
        door_pickup: searchData.door_pickup,
        food_stop: searchData.food_stop,
        garage: searchData.garage,
        parcels_allowed: searchData.parcels_allowed,
        sort_by_price: searchData.sort_by_price,
        sort_by_time: searchData.sort_by_time,
        page,
        limit,
    })}`;

    const cached = await getOrSetCache(
        cacheKey,
        async () => {
            const offset = (page - 1) * limit;

            const { fromGeoData, toGeoData } = await fetchBothLocations(
                searchData.from_longitude,
                searchData.from_latitude,
                searchData.to_longitude,
                searchData.to_latitude,
            );

            const hybridFilters: tripRepository.TripHybridFilterOptions = {
                from_lat: searchData.from_latitude,
                from_lon: searchData.from_longitude,
                to_lat: searchData.to_latitude,
                to_lon: searchData.to_longitude,
                from_city_id: fromTarget.city?.id ?? null,
                to_city_id: toTarget.city?.id ?? null,
                search_from_city:
                    fromTarget.city?.canonical_uz || fromGeoData.cityName,
                search_to_city: toTarget.city?.canonical_uz || toGeoData.cityName,
                departure_date: searchData.departure_date.toISOString(),
                seats_available: searchData.requested_seats,
            };

            const driverFilters: tripRepository.DriverFilterOptions = {
                conditioner: searchData.conditioner,
                smoking_allowed: searchData.smoking_allowed,
                door_pickup: searchData.door_pickup,
                food_stop: searchData.food_stop,
                garage: searchData.garage,
                parcels_allowed: searchData.parcels_allowed,
            };

            const sortOptions = {
                sortByPrice: searchData.sort_by_price,
                sortByTime: searchData.sort_by_time,
            };

            const { count, rows } = await tripRepository.findHybridTrips(
                hybridFilters,
                limit,
                offset,
                driverFilters,
                sortOptions,
            );

            // Трипы того же маршрута, но на другие даты — отдельная витрина
            // «рекомендуем другую дату», не участвует в пагинации exact-списка.
            const recommendedRows = await tripRepository.findHybridTripsRecommended(
                hybridFilters,
                driverFilters,
            );

            return {
                rawTrips: rows,
                rawRecommendedTrips: recommendedRows,
                total: count,
                fromGeoData,
                toGeoData,
            };
        },
        300, // TTL: 5 минут
    );

    // ---- User-specific слой (вне кэша, свежие данные на каждый запрос) ----

    // История поиска — не зависит от кэша, пишем независимо
    if (identifier?.userId || identifier?.guestId) {
        saveSearchHistory(identifier, cached.fromGeoData, cached.toGeoData).catch(
            () => {},
        );
    }

    const [userPromoCode, blockedUserIds] = await Promise.all([
        getUserPromoCode(identifier?.userId),
        identifier?.userId
            ? userRepository.getBlockedUserIds(identifier.userId)
            : Promise.resolve([] as string[]),
    ]);

    const formattedTrips = formatRawTrips(
        cached.rawTrips,
        identifier,
        userPromoCode,
        blockedUserIds,
    );
    const formattedRecommendedTrips = formatRawTrips(
        cached.rawRecommendedTrips ?? [],
        identifier,
        userPromoCode,
        blockedUserIds,
    );

    // is_booked — свежий, один запрос по всем tripIds сразу из ОБОИХ списков
    const [tripsWithBooked, recommendedWithBooked] = await attachIsBooked(
        identifier?.userId,
        [formattedTrips, formattedRecommendedTrips],
    );

    return {
        trips: tripsWithBooked,
        recommended_trips: recommendedWithBooked,
        total: cached.total,
        totalPages: Math.ceil(cached.total / limit),
        currentPage: page,
    };
};

export const searchTripsPublic = async (params: any) => {
    const {
        from,
        to,
        from_lat,
        from_lon,
        to_lat,
        to_lon,
        departure_date,
        requested_seats = 1,
        page = 1,
        limit = 10,
        sort_by,
        sort_order,
        conditioner,
        smoking_allowed,
        door_pickup,
        food_stop,
        garage,
        max_two_back,
        pets_allowed,
        parcels_allowed,
    } = params;

    const offset = (page - 1) * limit;
    const dateSearch = departure_date
        ? new Date(departure_date).toISOString()
        : new Date().toISOString();

    const driverFilters: any = {
        conditioner,
        smoking_allowed,
        door_pickup,
        food_stop,
        garage,
        max_two_back,
        pets_allowed,
        parcels_allowed,
    };

    const result = await tripRepository.findHybridTripsPublic(
        {
            from_query: from,
            to_query: to,
            from_lat: from_lat ? parseFloat(from_lat) : undefined,
            from_lon: from_lon ? parseFloat(from_lon) : undefined,
            to_lat: to_lat ? parseFloat(to_lat) : undefined,
            to_lon: to_lon ? parseFloat(to_lon) : undefined,
            departure_date: dateSearch,
            seats_available: requested_seats,
        },
        limit,
        offset,
        driverFilters,
        { sortBy: sort_by, sortOrder: sort_order },
    );

    const formattedTrips = result.rows.map((trip: any) =>
        formatTripResponse(trip, null),
    );

    return {
        trips: formattedTrips,
        total: result.count,
        totalPages: Math.ceil(result.count / limit),
        page, // <-- фронт ждёт page
    };
};