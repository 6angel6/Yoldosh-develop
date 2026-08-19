import client from 'prom-client';

/**
 * Метрики уровня приложения, живущие в shared (default-реестр prom-client —
 * тот же, что отдаёт /metrics на METRICS_PORT).
 *
 * app_errors_total — таксономия ошибок под Grafana: всплеск
 * BOOKING_SEATS_UNAVAILABLE виден отдельно от GEO_SERVICE_UNAVAILABLE,
 * а не общей кашей 4xx/5xx. label error_code = UNCODED, если ошибка
 * создана без кода.
 */
export const appErrorsTotal = new client.Counter({
   name: 'app_errors_total',
   help: 'Application errors by machine-readable error code',
   labelNames: ['error_code', 'status_code'],
});

/**
 * Внешние зависимости: без этих метрик «у нас всё падает» и «Яндекс лежит»
 * неразличимы на дашборде.
 */
export const externalCallDuration = new client.Histogram({
   name: 'external_call_duration_seconds',
   help: 'Duration of outbound calls to external services',
   labelNames: ['target'],
   buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
});

export const externalCallTotal = new client.Counter({
   name: 'external_call_total',
   help: 'Outbound calls to external services by outcome',
   labelNames: ['target', 'outcome'],
});

/**
 * Обёртка исходящего вызова: меряет длительность и исход.
 * Ошибку не глотает — пробрасывает после учёта.
 */
export const measureExternalCall = async <T>(
   target: string,
   call: () => Promise<T>,
): Promise<T> => {
   const endTimer = externalCallDuration.startTimer({ target });
   try {
      const result = await call();
      externalCallTotal.inc({ target, outcome: 'success' });
      return result;
   } catch (err) {
      externalCallTotal.inc({ target, outcome: 'error' });
      throw err;
   } finally {
      endTimer();
   }
};
