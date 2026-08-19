/**
 * Утилиты времени для Trip Predictor.
 *
 * Узбекистан — фиксированный UTC+5 без перехода на летнее время (с 1992).
 * Поэтому время-суток в UTC стабильно соответствует локальному, а конвертация
 * сводится к сдвигу на +5ч. Это делает логику детерминированной и тестируемой.
 */
export const UZT_OFFSET_MIN = 300; // UTC+5

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_IN_DAY = 1440;

/** Минуты от полуночи по местному времени UZT (0..1439). */
export const minutesOfDayUZT = (date: Date): number => {
   const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
   return (utcMin + UZT_OFFSET_MIN) % MINUTES_IN_DAY;
};

/** Календарная дата UZT в формате YYYY-MM-DD. */
export const uztDateString = (date: Date): string => {
   const shifted = new Date(date.getTime() + UZT_OFFSET_MIN * 60 * 1000);
   const y = shifted.getUTCFullYear();
   const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
   const d = String(shifted.getUTCDate()).padStart(2, '0');
   return `${y}-${m}-${d}`;
};

/** [начало, конец) календарного дня UZT (в UTC) для UZT-дня переданной даты. */
export const uztDayRangeUTC = (date: Date): { start: Date; end: Date } => {
   const [y, m, d] = uztDateString(date).split('-').map(Number);
   const startUTCms =
      Date.UTC(y, m - 1, d, 0, 0, 0, 0) - UZT_OFFSET_MIN * 60 * 1000;
   return { start: new Date(startUTCms), end: new Date(startUTCms + DAY_MS) };
};

/** Сдвиг даты на целое число суток (сохраняет время-суток, DST в UZ нет). */
export const addDays = (date: Date, days: number): Date =>
   new Date(date.getTime() + days * DAY_MS);

/**
 * Кратчайшая дистанция между двумя временами суток (минуты) с учётом перехода
 * через полночь: circularDiffMin(1430, 10) === 20.
 */
export const circularDiffMin = (a: number, b: number): number => {
   const diff = Math.abs(a - b) % MINUTES_IN_DAY;
   return Math.min(diff, MINUTES_IN_DAY - diff);
};
