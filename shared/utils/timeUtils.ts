export const getCurrentTimeUTC = (): Date => {
    return new Date();
};

export const getStartOfDayUTC = (date: Date): Date => {
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            0,
            0,
            0,
            0,
        ),
    );
};

export const getStartOfTodayUTC = (): Date => {
    const now = getCurrentTimeUTC();
    return getStartOfDayUTC(now);
};

// Начало СЛЕДУЮЩИХ суток (эксклюзивная верхняя граница выбранного дня).
// Используется, чтобы отделить "трипы ровно на выбранную дату" от
// "трипов на другие даты" (recommended).
export const getEndOfDayUTC = (date: Date): Date => {
    const startOfDay = getStartOfDayUTC(date);
    return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
};

export const getMinSearchTime = (searchDate: Date): Date => {
    const now = getCurrentTimeUTC();
    const startOfSearchDay = getStartOfDayUTC(searchDate);

    // Никогда не опускаемся ниже «сейчас»: будущая дата → начало того дня;
    // сегодня или прошлая дата → now. Иначе трипы с уже прошедшим departure_ts
    // (status всё ещё CREATED, т.к. экспирации нет) проходили бы фильтр
    // departure_ts >= minDate и всплывали в поиске.
    return startOfSearchDay.getTime() > now.getTime() ? startOfSearchDay : now;
};

export const addHours = (date: Date, hours: number): Date => {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
};

export const isInPast = (date: Date): boolean => {
    return date < getCurrentTimeUTC();
};