# Yoldosh Backend

> © 2026 ООО «Milliy Yoldosh». Проприетарное ПО, все права защищены. См. [LICENSE](LICENSE).

Ride-sharing бэкенд (межгород, Узбекистан): Express + TypeScript, Sequelize +
PostgreSQL/PostGIS, BullMQ + Redis, Socket.io. Часть трипов импортируется из
Telegram-парсера через `POST /internal/trips/import`.

Это единственный `.md`, который коммитится в репозиторий (`.gitignore`
игнорирует остальные). Разделы после «Запуска» — конвенции: они
обязательны для нового кода и проверяются на ревью.

## Что внутри

Монолит на Express 5, разложенный по доменным модулям в `src/`: `auth`,
`user`, `car`, `trips` (поиск, жизненный цикл, импорт, предиктор),
`booking`, `parcel`, `payment`, `promocode`, `rating`, `chat`, `call`,
`city`, `banner`, `blog`, `admin`, `monitoring`, `workers`. Общий код —
в `shared/` (модели, middleware, конфиги, i18n, утилиты).

- **PostgreSQL + PostGIS** — основная база, гео-поиск трипов по bbox и
  `ST_DWithin`; есть реплика для чтения.
- **Redis** — два инстанса: кэш и очереди.
- **BullMQ** — фоновые задачи: пуши, повторяющиеся джобы, автозавершение
  зависших трипов, прогнозные трипы.
- **Socket.io + ws** — реалтайм-чат и события трипа.
- **MinIO (S3)** — медиа чата и аватары.
- **Prometheus + Alertmanager + Grafana/Loki** — метрики и логи.

Часть трипов приходит из Telegram-парсера через
`POST /internal/trips/import` (авторизация по `INTERNAL_API_KEY`).

## Запуск

Нужны Node.js 20+, Docker и заполненный `.env` (в репозиторий не
коммитится). Минимальный набор переменных: `PORT`, `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `REDIS_URL`, `REDIS_QUEUE_URL`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_KEY`, `YANDEX_GEOCODER`.

### Всё в Docker

```bash
docker compose up -d --build
```

Поднимет базу с репликой, оба Redis, MinIO, прогонит миграции
(`yoldosh-migrations` отрабатывает до старта приложения) и запустит API на
`5000`. Метрики (`9100`) наружу не публикуются — их скрейпит Prometheus по
внутренней сети.

### Локально, инфраструктура в Docker

```bash
npm install
docker compose up -d db redis-cache redis-queue minio
npm run migrate          # миграции (в них же справочник городов и регионов)
npm run dev              # nodemon + ts-node, http://localhost:5000
```

Воркеры поднимаются вместе с приложением. Отдельно, если нужно гонять их
своим процессом: `npm run worker:all` (или `worker:notification`,
`worker:recurring`, `worker:scheduled`).

### Проверить, что живо

- `GET /api/v1/health` — состояние БД, Redis, очередей.
- `GET /api/v1/api-docs` — Swagger UI (`swagger.yaml`).
- `GET /metrics` на порту `9100` — метрики Prometheus.

### Остальные команды

```bash
npm run build       # tsc --build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (lint:fix — с автоправкой)
npm run format      # prettier
npm run migrate:create -- <name>   # новая миграция
npm run migrate:undo               # откатить последнюю
```

## Слои: controller → service → repository

- **controller** — парсинг входа (Zod), вызов ОДНОГО сервиса, формирование
  ответа через `shared/utils/apiResponse.ts`. Ни одного обращения к
  моделям/БД. Ни одной бизнес-ветки (`if user.role...` — в сервис).
- **service** — бизнес-логика, транзакции (`withDeadlockRetry`), композиция
  репозиториев. Не знает про `Request`/`Response`. Бросает только доменные
  ошибки — классы из `shared/utils/errorHandler.ts`, никаких голых
  `throw new Error(...)`.
- **repository** — только запросы к БД. Не бросает бизнес-ошибок, не
  логирует бизнес-события. Не открывает свою транзакцию, если ему передали
  внешнюю параметром.
- Деньги, брони, статусы трипов — только в транзакции; уведомления и
  инвалидация кэша — строго после commit. Внутри одной Sequelize-транзакции
  запросы не параллелить (`Promise.all` по одной tx запрещён).
- Статус трипа меняется только через `tripStateMachine.transition` —
  прямые `trip.status = ...` запрещены (исключение: принудительная смена
  из админки, `src/admin/trips/service/tripsService.ts`).

## try/catch: где нужен и где нет

Нужен:

1. Граница HTTP — один раз на контроллер (`handleControllerError`). Не в
   каждом методе сервиса.
2. Вокруг внешних вызовов (Яндекс, Eskiz, Paynet, FCM), **если** есть
   осмысленная реакция: retry, fallback, деградация, перевод в доменную
   ошибку (например, `ServiceUnavailableError` с
   `ErrorCode.GEO_SERVICE_UNAVAILABLE`). Поймал → обогатил контекстом →
   пробросил доменную.
3. Fire-and-forget задачи (уведомления после commit, прогрев кэша) —
   обязательный `catch` с логом, иначе `unhandledRejection`.
4. Обработчики BullMQ-джоб и Socket.io-событий — верхнеуровневый catch
   (у них нет express error middleware).
5. Циклы обработки батчей, где падение одного элемента не должно валить
   остальные, — catch на итерацию + счётчик failed в лог.

Не нужен (удаляется на ревью):

1. `try { ... } catch (e) { throw e }` — пустая ретрансляция.
2. `catch (e) { logger.error(e); throw e }` в середине стека — двойной лог.
   **Ошибка логируется ровно один раз — на границе.** Промежуточные слои не
   логируют то, что пробрасывают.
3. Оборачивание чистых sync-вычислений «на всякий случай».
4. Catch, превращающий ошибку в `return null` без различения причин, —
   маскирует баги. Либо доменная ошибка, либо честный проброс.

Ни одного floating promise: каждый async-вызов либо `await`-ится, либо явно
передаётся в fire-and-forget с catch+логом. `forEach(async ...)` запрещён.

## Ошибки и таксономия `error_code`

Контракт ошибочного ответа (фронт привязан к этой форме, поля не
переименовывать / не удалять / не менять тип; новые поля — только аддитивно):

```json
{
   "success": false,
   "status_code": 400,
   "message": "<человекочитаемое>",
   "errors": "<детали, опционально>",
   "error_code": "<ErrorCode, опционально>"
}
```

- Доменные ошибки — классы из `shared/utils/errorHandler.ts`
  (`BadRequestError`, `NotFoundError`, `ConflictError`, ...). Каждый
  конструктор принимает необязательный `code` из enum `ErrorCode`
  (`shared/utils/errorCodes.ts`).
- Код — стабильная строка `<МОДУЛЬ>_<ПРИЧИНА>`
  (`BOOKING_SEATS_UNAVAILABLE`, `TRIP_INVALID_TRANSITION`,
  `GEO_SERVICE_UNAVAILABLE`, ...). Все коды живут только в enum — никаких
  строк россыпью. После попадания в прод код не переименовывается: на него
  завязаны фронт, логи и метрики.
- Если `code` не задан — поле `error_code` в теле не появляется вовсе.
- Ловушка сигнатуры: `apiResponse.badRequest(res, errors, message?)` —
  второй аргумент это `errors`, а не `message` (подробности в JSDoc
  `shared/utils/apiResponse.ts`).

## Логи

- Только структурный логгер `shared/utils/logger.ts` (pino). `console.log`
  запрещён.
- Фиксированные имена полей — Grafana-дашборды строятся по ним, разнобой
  (`user_id` vs `userId`) запрещён:
  `level, time, requestId, userId, module, operation, error_code, durationMs`.
- Ошибка логируется ровно один раз — на границе (error handler, обработчик
  джобы/сокета).
- PII в логи нельзя: телефон целиком (только маска `+99890***4567`), OTP,
  токены, тела платёжных запросов.

## Валидация входа

**Новый роут без Zod-схемы не проходит ревью.** Валидируются `body`,
`params` (все `:id` — uuid) и `query` (pagination с верхней границей
`limit`). Схемы лежат рядом с модулем (`models/dto/*.ts`), имя —
`<action><Entity>Schema`.

## Тесты

vitest + supertest против реального PostgreSQL (PostGIS) и Redis;
`test/setup.ts` делает `db.sync({ force: true })` и TRUNCATE перед каждым
тестом (фикстуры — только в `beforeEach`). Запуск:

```bash
NODE_ENV=test DOCKER_ENV=false \
TEST_DB_HOST=<host> TEST_DB_PORT=<port> \
TEST_DB_USER=<user> TEST_DB_PASSWORD=<password> TEST_DB_NAME=<db> \
REDIS_URL=<redis> REDIS_QUEUE_URL=<redis> \
npx vitest run test --no-file-parallelism
```

Багфикс начинается с падающего теста (red → green). Тесты проверяют
поведение (статусы, балансы, форму ответа), а не реализацию.

## Лицензия

© 2026 ООО «Milliy Yoldosh». Все права защищены.

Проприетарное программное обеспечение. Копирование, использование,
распространение и переработка кода — в том числе фрагментов — запрещены
без письменного разрешения правообладателя. Публикация репозитория не
даёт никаких прав на использование. Условия — в файле [LICENSE](LICENSE).
