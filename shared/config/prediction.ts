/**
 * Конфигурация Trip Predictor (Этап 1 / MVP).
 *
 * Идиома проекта — constant-модуль (ср. shared/config/commission.ts): плоский
 * объект с ENV-override и безопасными дефолтами. Все пороги переопределяются
 * через переменные окружения; без ENV работает на значениях из ТЗ §10.
 *
 * PREDICTION_ENABLED — рубильник: при false предиктор становится no-op, приём
 * трипов работает как раньше (мгновенный откат фичи без деплоя кода).
 */
export const PREDICTION_CONFIG = {
   // Признание регулярности: ≥ MIN_OCCURRENCES одинаковых трипов за WINDOW_DAYS.
   // Главный признак — тот же маршрут в ≥ 2 разных дня.
   MIN_OCCURRENCES: Number(process.env.PREDICTION_MIN_OCCURRENCES ?? 2),
   WINDOW_DAYS: Number(process.env.PREDICTION_WINDOW_DAYS ?? 7),

   // Горизонт прогнозов (сколько дней вперёд «доливаем»), начиная с завтра.
   HORIZON_DAYS: Number(process.env.PREDICTION_HORIZON_DAYS ?? 7),

   // Учитывать ли время выезда при определении регулярности.
   //   false (по умолчанию) — время ОПЦИОНАЛЬНО: регулярность = тот же маршрут
   //     в разные дни, независимо от времени. Паттерн — один на маршрут; его
   //     departure_time = медиана наблюдённых времён (для расписания прогнозов).
   //   true — строгий режим: трип должен попасть в ±TIME_TOLERANCE_MIN от времени
   //     паттерна, чтобы засчитаться в окно и подтвердить прогноз.
   MATCH_BY_TIME: (process.env.PREDICTION_MATCH_BY_TIME ?? 'false') === 'true',

   // Допуск времени выезда (минуты) — используется только при MATCH_BY_TIME=true
   // и для расписания прогнозов.
   TIME_TOLERANCE_MIN: Number(process.env.PREDICTION_TIME_TOLERANCE_MIN ?? 30),

   // Прогнозы создаются при confidence ≥ порога.
   CONFIDENCE_THRESHOLD: Number(
      process.env.PREDICTION_CONFIDENCE_THRESHOLD ?? 0.5,
   ),

   // --- [Этап 2] decay / реактивация (скелет; логика — на Этапе 2) ---
   DECAY_DAYS: Number(process.env.PREDICTION_DECAY_DAYS ?? 3),
   INACTIVE_DAYS: Number(process.env.PREDICTION_INACTIVE_DAYS ?? 7),
   REACTIVATION_MIN_OCC: Number(
      process.env.PREDICTION_REACTIVATION_MIN_OCC ?? 2,
   ),

   // Сколько последних времён выезда храним в паттерне (median + stddev без
   // хранения полной истории).
   RECENT_TIMES_CAP: Number(process.env.PREDICTION_RECENT_TIMES_CAP ?? 14),

   // Веса эвристического скоринга (ТЗ §4.3). Сумма = 1.0.
   WEIGHTS: {
      frequency: Number(process.env.PREDICTION_W_FREQUENCY ?? 0.4),
      recency: Number(process.env.PREDICTION_W_RECENCY ?? 0.4),
      consistency: Number(process.env.PREDICTION_W_CONSISTENCY ?? 0.2),
   },

   // Рубильник фичи.
   ENABLED: (process.env.PREDICTION_ENABLED ?? 'true') === 'true',

   // Таймзона проекта — Узбекистан без DST (фикс UTC+5). Используется для
   // вычисления времени-суток и границ календарного дня.
   TIMEZONE: 'Asia/Tashkent',
} as const;

export type PredictionConfig = typeof PREDICTION_CONFIG;
