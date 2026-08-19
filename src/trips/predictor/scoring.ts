import { PREDICTION_CONFIG } from '../../../shared/config/prediction';

/**
 * Скоринг регулярности водителя.
 *
 * Единственная точка, которую в v2 ([Этап 3]) заменит обученная модель:
 * интерфейс `score(input) -> number` остаётся, пайплайн не меняется.
 *
 * Эвристика v1 (ТЗ §4.3):
 *   frequency   = min(window_occurrences / 7, 1)
 *   recency     = exp(-days_since_last_seen / 3)
 *   consistency = clamp(1 - stddev(departure_min) / 60, 0, 1)
 *   confidence  = w1*frequency + w2*recency + w3*consistency
 */
export interface ScoreInput {
   /** Число повторов в скользящем окне WINDOW_DAYS. */
   windowOccurrences: number;
   /** Дней с последнего реального трипа (0 = сегодня). */
   daysSinceLastSeen: number;
   /** Последние времена выезда (минуты UZT) — для оценки стабильности. */
   recentDepartureMin: number[];
   /**
    * Учитывать ли стабильность времени. Если false (время опционально) —
    * consistency-слагаемое нейтрально (=1): разброс времени не штрафует
    * регулярность по маршруту.
    */
   matchByTime?: boolean;
}

const clamp = (x: number, lo: number, hi: number): number =>
   Math.min(hi, Math.max(lo, x));

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const median = (values: number[]): number => {
   if (values.length === 0) return 0;
   const sorted = [...values].sort((a, b) => a - b);
   const mid = Math.floor(sorted.length / 2);
   return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
};

export const stddev = (values: number[]): number => {
   if (values.length < 2) return 0;
   const mean = values.reduce((s, v) => s + v, 0) / values.length;
   const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
   return Math.sqrt(variance);
};

export const heuristicScore = (input: ScoreInput): number => {
   const { WEIGHTS } = PREDICTION_CONFIG;

   const frequency = clamp(input.windowOccurrences / 7, 0, 1);
   const recency = Math.exp(-Math.max(0, input.daysSinceLastSeen) / 3);
   // Время опционально (matchByTime !== true) → стабильность не штрафуем.
   const consistency =
      input.matchByTime === false
         ? 1
         : clamp(1 - stddev(input.recentDepartureMin) / 60, 0, 1);

   const raw =
      WEIGHTS.frequency * frequency +
      WEIGHTS.recency * recency +
      WEIGHTS.consistency * consistency;

   return round3(clamp(raw, 0, 1));
};

/** Публичный контракт скоринга (под будущую ML-замену). */
export const score = heuristicScore;
