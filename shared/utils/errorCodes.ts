/**
 * Таксономия машиночитаемых кодов ошибок.
 *
 * Правила:
 * - Код — стабильная строка `<МОДУЛЬ>_<ПРИЧИНА>`. После попадания в прод
 *   код не переименовывается и не удаляется: на него завязаны фронт,
 *   логи и метрики (`app_errors_total{error_code}`).
 * - Все коды живут ТОЛЬКО в этом enum — никаких строк россыпью.
 * - Код передаётся необязательным аргументом в конструкторы `AppError`
 *   и подклассов (`shared/utils/errorHandler.ts`), уходит в лог и —
 *   строго аддитивно — в тело ответа полем `error_code`
 *   (`shared/utils/apiResponse.ts`).
 * - Новые коды добавляются в секцию своего модуля. Нет секции — заведите.
 */
export enum ErrorCode {
   // AUTH — аутентификация и сессии
   AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
   AUTH_OTP_INVALID = 'AUTH_OTP_INVALID',
   AUTH_OTP_EXPIRED = 'AUTH_OTP_EXPIRED',
   AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
   AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
   AUTH_SESSION_NOT_FOUND = 'AUTH_SESSION_NOT_FOUND',
   AUTH_ALREADY_REGISTERED = 'AUTH_ALREADY_REGISTERED',
   AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',

   // USER — профиль, водительские заявки, блокировки
   USER_NOT_FOUND = 'USER_NOT_FOUND',
   USER_BLOCKED = 'USER_BLOCKED',
   USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
   USER_APPLICATION_NOT_FOUND = 'USER_APPLICATION_NOT_FOUND',
   USER_SELF_BLOCK_NOT_ALLOWED = 'USER_SELF_BLOCK_NOT_ALLOWED',

   // BOOKING — брони
   BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
   BOOKING_SEATS_UNAVAILABLE = 'BOOKING_SEATS_UNAVAILABLE',
   BOOKING_ALREADY_EXISTS = 'BOOKING_ALREADY_EXISTS',
   BOOKING_INVALID_STATUS = 'BOOKING_INVALID_STATUS',
   BOOKING_ACCESS_DENIED = 'BOOKING_ACCESS_DENIED',

   // TRIP — трипы и их жизненный цикл
   TRIP_NOT_FOUND = 'TRIP_NOT_FOUND',
   TRIP_INVALID_TRANSITION = 'TRIP_INVALID_TRANSITION',
   TRIP_ALREADY_STARTED = 'TRIP_ALREADY_STARTED',
   TRIP_ACCESS_DENIED = 'TRIP_ACCESS_DENIED',
   TRIP_IMPORT_INVALID_PAYLOAD = 'TRIP_IMPORT_INVALID_PAYLOAD',

   // PAYMENT — кошелёк, платежи, колбэки провайдеров
   PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
   PAYMENT_INSUFFICIENT_FUNDS = 'PAYMENT_INSUFFICIENT_FUNDS',
   PAYMENT_PROVIDER_ERROR = 'PAYMENT_PROVIDER_ERROR',
   PAYMENT_DUPLICATE_CALLBACK = 'PAYMENT_DUPLICATE_CALLBACK',

   // CHAT — чаты и сообщения
   CHAT_NOT_FOUND = 'CHAT_NOT_FOUND',
   CHAT_ACCESS_DENIED = 'CHAT_ACCESS_DENIED',

   // PROMOCODE — промокоды и рефералы
   PROMOCODE_NOT_FOUND = 'PROMOCODE_NOT_FOUND',
   PROMOCODE_EXPIRED = 'PROMOCODE_EXPIRED',
   PROMOCODE_ALREADY_USED = 'PROMOCODE_ALREADY_USED',
   REFERRAL_CODE_GENERATION_FAILED = 'REFERRAL_CODE_GENERATION_FAILED',

   // RATING — оценки участников поездки
   RATING_SELF_NOT_ALLOWED = 'RATING_SELF_NOT_ALLOWED',
   RATING_TRIP_NOT_COMPLETED = 'RATING_TRIP_NOT_COMPLETED',
   RATING_NOT_TRIP_PARTICIPANT = 'RATING_NOT_TRIP_PARTICIPANT',

   // CAR — машины водителей
   CAR_NOT_FOUND = 'CAR_NOT_FOUND',

   // GEO — внешний геокодер (Яндекс)
   GEO_SERVICE_UNAVAILABLE = 'GEO_SERVICE_UNAVAILABLE',
   GEO_ADDRESS_NOT_FOUND = 'GEO_ADDRESS_NOT_FOUND',

   // SMS — внешний SMS-шлюз (Eskiz)
   SMS_SERVICE_UNAVAILABLE = 'SMS_SERVICE_UNAVAILABLE',

   // VALIDATION — невалидный вход (Zod и ручные проверки)
   VALIDATION_FAILED = 'VALIDATION_FAILED',

   // INTERNAL — неожиданные ошибки и инфраструктура
   INTERNAL_UNEXPECTED = 'INTERNAL_UNEXPECTED',
   INTERNAL_DEPENDENCY_UNAVAILABLE = 'INTERNAL_DEPENDENCY_UNAVAILABLE',
}
